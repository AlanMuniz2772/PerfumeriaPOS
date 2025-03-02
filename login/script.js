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
        document.getElementById("message").textContent = "Credenciales incorrectas";
      }
  })
  .catch(error => console.error("Error:", error));
}

function openChangePasswordModal() {
  document.getElementById("changePasswordModal").style.display = "block";
}

function closeChangePasswordModal() {
  document.getElementById("changePasswordModal").style.display = "none";
}

function changePassword() {
  const user = document.getElementById("changeUser").value;
  const currentPassword = document.getElementById("currentPassword").value;
  const newPassword = document.getElementById("newPassword").value;

  if (!user || !currentPassword || !newPassword) {
    document.getElementById("changeMessage").textContent = "Todos los campos son obligatorios.";
    return;
  }

  fetch("http://localhost:3000/change_password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user, currentPassword, newPassword })
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      document.getElementById("changeMessage").textContent = "Contraseña actualizada con éxito.";
    } else {
      document.getElementById("changeMessage").textContent = "Error: " + data.message;
    }
  })
  .catch(error => console.error("Error:", error));
}