const el = document.getElementById("status");

fetch("http://localhost:4000/api/health")
  .then((r) => r.json())
  .then(() => {
    el.textContent = "● Server connected";
    el.className = "status ok";
  })
  .catch(() => {
    el.textContent = "● Server not running";
    el.className = "status bad";
  });
