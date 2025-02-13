const express = require("express");
const mysql = require("mysql2");

const app = express();
app.use(express.json());

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "2187",
    database: "punto_de_venta"
});

db.connect(err => {
    if (err) throw err;
    console.log("Conectado a MySQL");
});

app.get("/productos", (req, res) => {
    db.query("SELECT * FROM productos", (err, results) => {
        if (err) throw err;
        res.json(results);
    });
});

app.listen(3000, () => console.log("Servidor en http://localhost:3000"));
