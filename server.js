require('dotenv').config();

const express = require("express");
const mysql = require("mysql2");

const app = express();
app.use(express.json());


const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

db.connect(err => {
    if (err) throw err;
    console.log("Conectado a MySQL");
});

app.post("/login", (req, res) => {
    const { user, password } = req.body;
    const sql = "SELECT * FROM LOGIN WHERE USUARIO = ? AND PASSWORDD = ?";

    db.query(sql, [user, password], (err, results) => {
        if (err) return res.status(500).json({ error: "Error en el servidor" });
        if (results.length === 0) return res.status(401).json({ error: "Credenciales incorrectas" });

        res.json({ success: true });
    });
});

app.post("/change_password", (req, res) => {
    const { user, currentPassword, newPassword } = req.body;
  
    if (!user || !currentPassword || !newPassword) {
      return res.json({ success: false, message: "Todos los campos son obligatorios." });
    }
  
    // 1️⃣ Verificar si el usuario y la contraseña actual son correctos
    db.query("SELECT PASSWORDD FROM LOGIN WHERE USUARIO = ? AND PASSWORDD = ?", [user, currentPassword], (err, results) => {
      if (err) return res.status(500).json({ success: false, message: "Error en el servidor." });
  
      if (results.length === 0) {
        return res.json({ success: false, message: "Usuario o contraseña incorrectos." });
      }
  
      // 2️⃣ Actualizar la contraseña
      db.query("UPDATE LOGIN SET PASSWORDD = ? WHERE USUARIO = ?", [newPassword, user], (err) => {
        if (err) return res.status(500).json({ success: false, message: "Error al actualizar la contraseña." });
  
        res.json({ success: true, message: "Contraseña actualizada con éxito." });
      });
    });
  });

//GETS
app.get("/clientes", (req, res) => {
    db.query("SELECT * FROM CLIENTES", (err, results) => {
        if (err) throw err;
        res.json(results);
    });
});

app.get("/productos", (req, res) => {
    db.query("SELECT * FROM PRODUCTOS", (err, results) => {
        if (err) throw err;
        res.json(results);
    });
});


// Ruta para obtener el reporte financiero por fecha
app.get("/reporte_financiero", (req, res) => {
    const { fechaInicial, fechaFinal } = req.query; // Fechas proporcionadas por el usuario
    
    console.log('Fechas recibidas:', fechaInicial, fechaFinal);  // Verifica que se están recibiendo las fechas
    
    const sql = "SELECT * FROM VENTAS WHERE FECHA BETWEEN ? AND ?";
    
    db.query(sql, [fechaInicial, fechaFinal], (err, results) => {
      if (err) {
        console.error("Error al obtener reporte financiero:", err);
        return res.status(500).json({ error: "Error en el servidor" });
      }
      
      if (results.length === 0) {
        return res.status(404).json({ message: "No se encontraron ventas para el rango de fechas proporcionado." });
      }

      // Enviar los resultados al frontend
      res.json(results);
    });
});



  
  

  





app.get("/ventas_pendientes/:idCliente", (req, res) => {
    const idCliente = req.params.idCliente;

    const sql = `
      SELECT IDVENTA, VENTATOTAL, SALDOABONADO, FECHA
      FROM VENTAS
      WHERE IDCLIENTE = ? AND (VENTATOTAL - SALDOABONADO) > 0 AND IDTIPO = 2;`;

    db.query(sql, [idCliente], (err, results) => {
        if (err) {
            console.error("Error al obtener ventas pendientes:", err);
            res.status(500).json({ error: "Error en el servidor" });
            return;
        }
        res.json(results);
    });
});



//POSTS
app.post("/registrar_cliente", (req, res) => {
    const { nombre, apaterno, amaterno, colonia, calle, numero, telefono } = req.body;

    const sql = "INSERT INTO CLIENTES (nombre, apaterno, amaterno, colonia, calle, numero, telefono) VALUES (?, ?, ?, ?, ?, ?, ?)";
    const valores = [nombre, apaterno, amaterno, colonia, calle, numero, telefono];

    db.query(sql, valores, (err, result) => {
        if (err) {
            console.error("Error al insertar cliente:", err);
            res.status(500).json({ error: "Error al registrar el cliente" });
            return;
        }
        res.json({ mensaje: "Cliente registrado correctamente", id: result.insertId });
    });
});

app.post("/registrar_producto", (req, res) => {
    const { nombre, descripcion, cantidad, preciocompra, precioventa} = req.body;

    const sql = "INSERT INTO PRODUCTOS (nombre, descripcion, cantidad, preciocompra, precioventa) VALUES (?, ?, ?, ?, ?)";
    const valores = [nombre, descripcion, cantidad, preciocompra, precioventa];

    db.query(sql, valores, (err, result) => {
        if (err) {
            console.error("Error al insertar productos:", err);
            res.status(500).json({ error: "Error al registrar el producto" });
            return;
        }
        res.json({ mensaje: "Producto registrado correctamente", id: result.insertId });
    });
});


const registrarVenta = (req, res) => {
    const { IDCLIENTE, IDTIPO, SALDOABONADO, VENTATOTAL, productos } = req.body;

    console.log("Datos de la venta:", req.body);
    if (!IDCLIENTE || !IDTIPO || SALDOABONADO === undefined || VENTATOTAL === undefined) {
        return res.status(400).json({ error: "Faltan campos obligatorios en la solicitud" });
    }

    

    for (const producto of productos) {
        if (!producto.IDPRODUCTOS || !producto.CANTPRODUCTOS) {
            return res.status(400).json({ error: "Cada producto debe tener 'IDPRODUCTOS' y 'CANTPRODUCTOS'" });
        }
    }

    db.beginTransaction(err => {
        if (err) {
            console.error("Error al iniciar la transacción:", err);
            return res.status(500).json({ error: "Error al iniciar la transacción" });
        }

        insertarVenta(IDCLIENTE, IDTIPO, SALDOABONADO, VENTATOTAL, productos, res);
    });
};

const insertarVenta = (IDCLIENTE, IDTIPO, SALDOABONADO, VENTATOTAL, productos, res) => {
    const sqlVenta = "INSERT INTO VENTAS (IDCLIENTE, IDTIPO, SALDOABONADO, VENTATOTAL, FECHA) VALUES (?, ?, ?, ?, NOW())";
    db.query(sqlVenta, [IDCLIENTE, IDTIPO, SALDOABONADO, VENTATOTAL], (err, result) => {
        if (err) {
            console.error("Error al registrar la venta:", err);
            return db.rollback(() => {
                res.status(500).json({ error: "Error al registrar la venta", detalles: err.message });
            });
        }

        const IDVENTA = result.insertId;
        insertarDetalleVenta(IDVENTA, productos, res);
    });
};

const insertarDetalleVenta = (IDVENTA, productos, res) => {
    const sqlDetalle = "INSERT INTO VENTAS_has_PRODUCTOS (IDVENTA, IDPRODUCTOS, CANTPRODUCTOS) VALUES ?";
    const valoresDetalle = productos.map(p => [IDVENTA, p.IDPRODUCTOS, p.CANTPRODUCTOS]);

    db.query(sqlDetalle, [valoresDetalle], (err) => {
        if (err) {
            console.error("Error al registrar los productos en la venta:", err);
            return db.rollback(() => {
                res.status(500).json({ error: "Error al registrar los productos en la venta", detalles: err.message });
            });
        }

        actualizarStock(productos, IDVENTA, res);
    });
};

const actualizarStock = (productos, IDVENTA, res) => {
    // Primero, verificar si hay suficiente stock para cada producto
    const sqlVerificarStock = "SELECT CANTIDAD FROM PRODUCTOS WHERE IDPRODUCTOS = ?";
    const verificaciones = productos.map(p => new Promise((resolve, reject) => {
        db.query(sqlVerificarStock, [p.IDPRODUCTOS], (err, result) => {
            if (err) {
                reject(err);
            } else {
                const stockActual = result[0].CANTIDAD;
                if (stockActual < p.CANTPRODUCTOS) {
                    reject(new Error(`No hay suficiente stock para el producto ${p.IDPRODUCTOS}. Stock actual: ${stockActual}, cantidad solicitada: ${p.CANTPRODUCTOS}`));
                } else {
                    resolve();
                }
            }
        });
    }));

    // Si todas las verificaciones son exitosas, proceder con la actualización del stock
    Promise.all(verificaciones)
        .then(() => {
            const sqlActualizarStock = "UPDATE PRODUCTOS SET CANTIDAD = CANTIDAD - ? WHERE IDPRODUCTOS = ?";
            const queries = productos.map(p => new Promise((resolve, reject) => {
                db.query(sqlActualizarStock, [p.CANTPRODUCTOS, p.IDPRODUCTOS], (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            }));

            return Promise.all(queries);
        })
        .then(() => {
            db.commit(err => {
                if (err) {
                    console.error("Error al confirmar la transacción:", err);
                    return db.rollback(() => {
                        res.status(500).json({ error: "Error al confirmar la transacción", detalles: err.message });
                    });
                }
                res.json({ mensaje: "Venta registrada correctamente", IDVENTA });
            });
        })
        .catch(err => {
            console.error("Error en la verificación o actualización del stock:", err);
            db.rollback(() => {
                res.status(400).json({ error: "Error en el stock", detalles: err.message });
            });
        });
};

app.post("/registrar_venta", registrarVenta);

app.post("/registrar_abono", (req, res) => {
    const { idVenta, monto } = req.body;
    const fechaActual = new Date().toISOString().split('T')[0]; // Obtener la fecha actual en formato YYYY-MM-DD

    // Iniciar una transacción para garantizar consistencia en las actualizaciones
    db.beginTransaction((err) => {
        if (err) {
            console.error("Error al iniciar transacción:", err);
            return res.status(500).json({ error: "Error en el servidor" });
        }

        // Actualizar el saldo abonado en la tabla VENTAS
        const sqlUpdateVenta = `
            UPDATE VENTAS
            SET SALDOABONADO = SALDOABONADO + ?
            WHERE IDVENTA = ? AND (VENTATOTAL - SALDOABONADO) >= ?;
        `;

        db.query(sqlUpdateVenta, [monto, idVenta, monto], (err, result) => {
            if (err) {
                return db.rollback(() => {
                    console.error("Error al actualizar saldo en VENTAS:", err);
                    res.status(500).json({ error: "Error en el servidor" });
                });
            }

            if (result.affectedRows === 0) {
                return db.rollback(() => {
                    res.status(400).json({ error: "El abono excede el saldo pendiente o la venta no existe" });
                });
            }

            // Insertar el abono en la tabla CONTROLPAGOCREDITO
            const sqlInsertAbono = `
                INSERT INTO CONTROLPAGOCREDITO (IDVENTA, ABONO, FECHA)
                VALUES (?, ?, ?);
            `;

            db.query(sqlInsertAbono, [idVenta, monto, fechaActual], (err, result) => {
                if (err) {
                    return db.rollback(() => {
                        console.error("Error al insertar abono en CONTROLPAGOCREDITO:", err);
                        res.status(500).json({ error: "Error en el servidor" });
                    });
                }

                // Confirmar la transacción
                db.commit((err) => {
                    if (err) {
                        return db.rollback(() => {
                            console.error("Error al confirmar la transacción:", err);
                            res.status(500).json({ error: "Error en el servidor" });
                        });
                    }
                    res.json({ message: "Abono registrado correctamente" });
                });
            });
        });
    });
});




app.listen(3000, () => console.log("Servidor en http://localhost:3000"));
