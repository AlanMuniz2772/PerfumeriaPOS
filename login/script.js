document.getElementById("loginForm").addEventListener("submit", function(event) {
    event.preventDefault();
  
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    const errorMessage = document.getElementById("error-message");
  
    // Simulación de credenciales válidas
    const validUser = "admin";
    const validPass = "1234";
  
    if (username === validUser && password === validPass) {
      errorMessage.style.color = "green";
      errorMessage.textContent = "Inicio de sesión exitoso. Redirigiendo...";
      
      setTimeout(() => {
        window.location.href = "index.html"; // Redirige al menú principal
      }, 1500);
    } else {
      errorMessage.textContent = "Usuario o contraseña incorrectos";
    }
  });
  