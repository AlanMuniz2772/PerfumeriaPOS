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
