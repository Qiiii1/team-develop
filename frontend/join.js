document.getElementById('join').onclick = async () => {
  const button = document.getElementById('join'); button.disabled = true;
  try {
    const token = new URLSearchParams(location.search).get('token');
    if (!token) throw new Error('邀请链接缺少邀请码');
    const team = await window.TeamBackend.api('/teams/join','POST',{token});
    location.assign('/project.html?project=' + encodeURIComponent(team.id));
  } catch(error) { document.getElementById('status').textContent = error.message; button.disabled = false; }
};
