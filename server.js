require('dotenv').config();

const express = require("express");
const mysql = require("mysql2");

const app = express();
app.use(express.json());
app.use(cors());

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


//Reporte financiero
app.get("/reportes", async (req, res) => {
    const { inicio, fin } = req.query;

    if (!inicio || !fin) {
        return res.status(400).json({ error: "Debe proporcionar un rango de fechas válido" });
    }

    //Consulta para obtener todas las ventas en el rango de fechas
    const sqlVentas =  `SELECT * FROM VENTAS WHERE FECHA BETWEEN ? AND ?`;

    try {
        const ventas = await new Promise((resolve, reject) => {
            db.query(sqlVentas, [inicio, fin], (err, results) => {
                if (err) reject (err);
                else resolve(results);
            });
        });

        const reportes = [];

        for(const venta of ventas ) {
            const idVenta = venta.IDVENTA;

            //Obtener nombre completo del cliente
            const cliente = await new Promise((resolve, reject) => {
                db.query(
                    `SELECT NOMBRE, APATERNO, AMATERNO FROM CLIENTES WHERE IDCLIENTE = ?`,
                    [venta.IDCLIENTE],
                    (err, results) => {
                        if (err) reject(err);
                        else resolve(results[0]);
                    }
                );
            });

            //Obtener tipo de venta
            const tipoVenta = await new Promise((resolve, reject) => {
                db.query(
                    `SELECT TIPOVENTA FROM TIPOVENTA WHERE IDTIPO = ?`,
                    [venta.IDTIPO],
                    (err, results) => {
                        if (err) reject(err);
                        else resolve(results[0].TIPOVENTA);
                    }
                );
            });

            //Obtener los productos comprados
            const productos = await new Promise((resolve, reject) => {
                db.query(
                    `SELECT IDPRODUCTOS FROM VENTAS_has_PRODUCTOS WHERE IDVENTA = ?`,
                    [idVenta],
                    (err, results) => {
                        if (err) reject(err);
                        else resolve(results);
                    }
                );
            });

            const productosComprados = [];
            for (const producto of productos ) {
                const nombreProducto = await new Promise((resolve, reject) => {
                    db.query (
                        `SELECT NOMBRE FROM PRODUCTOS WHERE IDPRODUCTOS = ?`,
                        [producto.IDPRODUCTOS],
                        (err, results) => {
                            if (err) reject(err);
                            else resolve(results[0].NOMBRE);
                        }
                    );
                });
                productosComprados.push(nombreProducto);
            }

            //Verificar si la venta es de credito y obtener saldo pendiente
            let saldoPendiente = 0;
            if(venta.IDTIPO === 2) {
                saldoPendiente = await new Promise((resolve, reject) => {
                    db.query(
                        `SELECT SALDOPENDIENTE FROM CONTROLPAGOCREDITO WHERE IDVENTA = ?`,
                        [idVenta],
                        (err, results) => {
                            if (err) reject(err);
                            else resolve(results.length ? results[0].SALDOPENDIENTE : 0);
                        }
                    );
                });
            }

            //Agregar la informacion al reporte
            reportes.push({
                IDVENTA: idVenta,
                Cliente: `${cliente.NOMBRE} ${cliente.APATERNO} ${cliente.AMATERNO}`,
                ProductosComprados: productosComprados.join(", "),
                PagoTotal: venta.VENTATOTAL,
                TipoVenta: tipoVenta,
                Abono: venta.SALDOABONADO,
                SaldoPendiente: saldoPendiente
            });
        }

        res.json(reportes);   

    } catch(error) {
        console.error("Error al obtener reportes:", error);
        res.status(500).json({ error: "Error en el servidor al obtener reportes" });
    }
    
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


app.post("/registrar_venta", (req, res) => {
    const { IDCLIENTE, IDTIPO, SALDOABONADO, VENTATOTAL, productos } = req.body;

    if (!productos || productos.length === 0) {
        return res.status(400).json({ error: "Debe haber al menos un producto en la venta" });
    }

    db.beginTransaction(err => {
        if (err) {
            return res.status(500).json({ error: "Error al iniciar la transacción" });
        }

        // Insertar en VENTAS
        const sqlVenta = "INSERT INTO VENTAS (IDCLIENTE, IDTIPO, SALDOABONADO, VENTATOTAL, FECHA) VALUES (?, ?, ?, ?, NOW())";
        db.query(sqlVenta, [IDCLIENTE, IDTIPO, SALDOABONADO, VENTATOTAL], (err, result) => {
            if (err) {
                return db.rollback(() => {
                    res.status(500).json({ error: "Error al registrar la venta" });
                });
            }

            const IDVENTA = result.insertId;

            // Insertar en VENTAS_has_PRODUCTOS y actualizar stock
            const sqlDetalle = "INSERT INTO VENTAS_has_PRODUCTOS (IDVENTA, IDPRODUCTOS, CANTPRODUCTOS) VALUES ?";
            const valoresDetalle = productos.map(p => [IDVENTA, p.IDPRODUCTOS, p.CANTPRODUCTOS]);

            db.query(sqlDetalle, [valoresDetalle], (err) => {
                if (err) {
                    return db.rollback(() => {
                        res.status(500).json({ error: "Error al registrar los productos en la venta" });
                    });
                }

                // Actualizar stock en PRODUCTOS
                const sqlActualizarStock = "UPDATE PRODUCTOS SET CANTIDAD = CANTIDAD - ? WHERE IDPRODUCTOS = ?";
                const queries = productos.map(p => new Promise((resolve, reject) => {
                    db.query(sqlActualizarStock, [p.CANTPRODUCTOS, p.IDPRODUCTOS], (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    });
                }));

                Promise.all(queries)
                    .then(() => {
                        db.commit(err => {
                            if (err) {
                                return db.rollback(() => {
                                    res.status(500).json({ error: "Error al confirmar la transacción" });
                                });
                            }
                            res.json({ mensaje: "Venta registrada correctamente", IDVENTA });
                        });
                    })
                    .catch(err => {
                        db.rollback(() => {
                            res.status(500).json({ error: "Error al actualizar el stock" });
                        });
                    });
            });
        });
    });
});

app.post("/registrar_abono", (req, res) => {
    const { idVenta, monto } = req.body;

    const sql = `
      UPDATE VENTAS
      SET SALDOABONADO = SALDOABONADO + ?
      WHERE IDVENTA = ? AND (VENTATOTAL - SALDOABONADO) >= ?;
    `;

    db.query(sql, [monto, idVenta, monto], (err, result) => {
        if (err) {
            console.error("Error al registrar abono:", err);
            res.status(500).json({ error: "Error en el servidor" });
            return;
        }
        res.json({ message: "Abono registrado correctamente" });
    });
});




app.listen(3000, () => console.log("Servidor en http://localhost:3000"));
