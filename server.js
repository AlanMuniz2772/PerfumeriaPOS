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
app.get("/reportes", (req, res) => {
    const {inicio, fin} = req.query;
    
    if (!inicio || !fin) {
        return res.status(400).json({ error: "Debe proporcionar un rango de fechas válido" });
    }

    // Consultas separadas para ventas de contado y crédito
    const sqlContado = `
        SELECT 
            V.IDVENTA, 
            CONCAT(C.NOMBRE, ' ', C.APATERNO, ' ', C.AMATERNO) AS Cliente, 
            DATE_FORMAT(V.FECHA, '%Y-%m-%d') AS FechaVenta,
            GROUP_CONCAT(P.NOMBRE SEPARATOR ', ') AS ProductosComprados,
            'Contado' AS TipoVenta,
            V.VENTATOTAL AS PagoTotal,
            0 AS AbonoInicial,
            0 AS SaldoPendiente
        FROM VENTAS V
        JOIN CLIENTES C ON V.IDCLIENTE = C.IDCLIENTE
        LEFT JOIN VENTAS_has_PRODUCTOS VP ON V.IDVENTA = VP.IDVENTA
        LEFT JOIN PRODUCTOS P ON VP.IDPRODUCTOS = P.IDPRODUCTOS
        WHERE V.IDTIPO = 1 AND V.FECHA BETWEEN ? AND ?
        GROUP BY V.IDVENTA;
    `;

    const sqlCredito = `
        SELECT 
            V.IDVENTA, 
            CONCAT(C.NOMBRE, ' ', C.APATERNO, ' ', C.AMATERNO) AS Cliente, 
            DATE_FORMAT(V.FECHA, '%Y-%m-%d') AS FechaVenta,
            GROUP_CONCAT(P.NOMBRE SEPARATOR ', ') AS ProductosComprados,
            'Credito' AS TipoVenta,
            V.VENTATOTAL AS PagoTotal,
            COALESCE(CC.ABONO, 0) AS AbonoInicial,
            COALESCE(CC.SALDOPENDIENTE, 0) AS SaldoPendiente
        FROM VENTAS V
        JOIN CLIENTES C ON V.IDCLIENTE = C.IDCLIENTE
        LEFT JOIN VENTAS_has_PRODUCTOS VP ON V.IDVENTA = VP.IDVENTA
        LEFT JOIN PRODUCTOS P ON VP.IDPRODUCTOS = P.IDPRODUCTOS
        LEFT JOIN CONTROLPAGOCREDITO CC ON V.IDVENTA = CC.IDVENTA
        WHERE V.IDTIPO = 2 AND V.FECHA BETWEEN ? AND ?
        GROUP BY V.IDVENTA;
    `;


    // Ejecutar ambas consultas y combinar los resultados
    db.query(sqlContado, [inicio, fin], (err, resultsContado) => {
        if (err) {
            console.error("Error obteniendo ventas de contado:", err);
            return res.status(500).json({ error: "Error al obtener ventas de contado" });
        }

        db.query(sqlCredito, [inicio, fin], (err, resultsCredito) => {
            if (err) {
                console.error("Error obteniendo ventas de crédito:", err);
                return res.status(500).json({ error: "Error al obtener ventas de crédito" });
            }
            
            const reportes = [...resultsContado, ...resultsCredito];
            reportes.sort((a, b) => new Date(b.FechaVenta) - new Date(a.FechaVenta));
            res.json(reportes);
        });
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

// Registrar una venta
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




app.listen(3000, () => console.log("Servidor en http://localhost:3000"));
