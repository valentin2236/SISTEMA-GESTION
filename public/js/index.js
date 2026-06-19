document.addEventListener('DOMContentLoaded', ()=>{
  const token = localStorage.getItem('token');
  if (!token) { location.href = '/admin/login.html'; return; }

  const email = localStorage.getItem('user_email') || 'Usuario';
  document.getElementById('user-email').textContent = email;

  document.getElementById('btn-logout').addEventListener('click', ()=>{
    localStorage.removeItem('token');
    localStorage.removeItem('user_email');
    location.href = '/admin/login.html';
  });
});
