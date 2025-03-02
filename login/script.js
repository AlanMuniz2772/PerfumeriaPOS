function login() {
  const user = document.getElementById("user").value;
  const password = document.getElementById("password").value;

  fetch("http://localhost:3000/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, password })
  })
  .then(response => response.json())
  .then(data => {
        if (data.success) {
          window.electron.sendLoginSuccess();
      } else {
          console.error("Usuario o contraseña incorrectos");
      }
  })
  .catch(error => console.error("Error:", error));
}
