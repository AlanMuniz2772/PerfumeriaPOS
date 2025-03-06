const { app, BrowserWindow, ipcMain  } = require("electron");
const { exec, execSync } = require("child_process");
const net = require("net");
const path = require("path");

const PORT = 3000;
let serverProcess = null;

function checkServerRunning(port, callback) {
    const server = net.createServer();
    server.once("error", (err) => {
        if (err.code === "EADDRINUSE") {
            console.log(`Servidor ya en ejecución en el puerto ${port}`);
            callback(true);
        } else {
            callback(false);
        }
    });

    server.once("listening", () => {
        server.close();
        callback(false);
    });

    server.listen(port);
}

app.whenReady().then(() => {
    checkServerRunning(PORT, (isRunning) => {
        if (!isRunning) {
            serverProcess = exec("node server.js", (error, stdout, stderr) => {
                if (error) {
                    console.error("Error iniciando servidor:", error);
                    return;
                }
                console.log(stdout);
            });
        }
    });
});

function createWindow() {
    let win = new BrowserWindow({
        width: 800,
        height: 600,
        fullscreen: true,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"), // Usar un script de preload
            contextIsolation: true, // Asegura que el contexto sea seguro
            enableRemoteModule: false,
            nodeIntegration: false // Mantener desactivado para seguridad
        },
    });

    win.loadFile("login/login.html");

    ipcMain.on("login-success", () => {
        win.loadFile("index.html"); // Cargar la pantalla principal
    });

    win.on("closed", () => {
        // Cierra el servidor cuando la ventana de Electron se cierre
        if (serverProcess) {
            console.log("Cerrando servidor...");
            execSync("taskkill /F /IM node.exe"); // Windows
            // execSync("pkill -f 'node server.js'"); // Linux/macOS
        }
        app.quit();
    });
}

app.whenReady().then(createWindow);
