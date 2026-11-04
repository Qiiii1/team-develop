(() => {
  if (window.prepareProjectInvite) return;
  const service = window.TeamBackend;
  if (!service?.boot?.user) return;
  const add = EventTarget.prototype.addEventListener;
  const backs = ['8d3e78b3d892d449131e','d8035893bf29af9bb1b6','09628c4078f9e261172b','e08c48636e78b069177f','04f5c5df60d1364ffc19','4c74d9d0fb4f635500dc','054041a2878a36e04e8a','056816d54599ecccdbb2','2b31c1f654dcbce32a89'];
  let timer = null;
  const project = () => new URLSearchParams(location.search).get('project') || service.boot.team?.id;
  window.prepareProjectInvite = async id => {
    const invite = await service.api(`/teams/${id}/invites`,'POST',{});
    const url = new URL('/join.html', location.origin); url.searchParams.set('token', invite.token); return url.href;
  };
  async function paint() {
    if (location.pathname !== '/project.html' || !project()) return;
    const id = project();
    const { members } = await service.api(`/teams/${id}/members`);
    const seats = [0,1,2,3,5];
    document.querySelectorAll('.workstation').forEach((seat,index) => {
      const character = seat.querySelector('.seat-character-layer'), name = seat.querySelector('.member-name');
      if (!character || !name) return;
      seat.dataset.joinedSeat = 'true'; delete character.dataset.userSeat;
      if (index === 4) { name.textContent = '总AI'; character.hidden = false; character.style.display = 'block'; return; }
      const member = members[seats.indexOf(index)]; const own = member?.userId === service.boot.user.id;
      seat.dataset.ownSeat = String(own); seat.style.cursor = own ? 'pointer' : 'default';
      seat.removeAttribute('role'); seat.removeAttribute('tabindex'); seat.removeAttribute('title');
      if (!member) { name.textContent = '空座位'; character.hidden = true; character.style.display = 'none'; return; }
      name.textContent = member.displayName; character.hidden = false; character.style.display = 'block'; character.dataset.characterId = member.avatarId;
      const indexAvatar = Math.max(0,Number(member.avatarId?.split('-')[1] || 1)-1);
      character.querySelector('img').src = 'assets/media/' + backs[indexAvatar] + '.png';
      if (own) { character.dataset.userSeat = 'true'; seat.setAttribute('role','link'); seat.tabIndex = 0; seat.title = '打开个人 AI'; }
    });
  }
  add.call(document,'click',event => {
    const seat = event.target.closest?.('.workstation[data-joined-seat]'); if (!seat) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (seat.dataset.ownSeat === 'true') { const url = new URL('/personal-ai.html',location.origin); url.searchParams.set('project',project()); window.appNavigate ? appNavigate(url) : location.assign(url); }
  },true);
  add.call(document,'DOMContentLoaded',() => {
    clearInterval(timer); void paint().catch(() => {});
    timer = setInterval(() => { if (!document.hidden) void paint().catch(() => {}); },5000);
    const invite = document.getElementById('invite');
    if (invite && service.boot.team?.role === 'member') { invite.disabled = true; invite.title = '请联系团队发起人或管理员生成邀请'; }
  });
  add.call(document,'ok-ah:route-dispose',() => clearInterval(timer));
})();
