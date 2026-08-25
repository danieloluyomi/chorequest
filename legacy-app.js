const seedChores = [
  {id:1,name:'Make your bed',category:'home',icon:'🛏️',points:15,source:'parent',status:'todo',time:'Due before 9:00 AM'},
  {id:2,name:'Empty the dishwasher',category:'kitchen',icon:'🍽️',points:30,source:'parent',status:'todo',time:'Due by 5:00 PM'},
  {id:3,name:'Finish math homework',category:'school',icon:'📚',points:25,source:'self',status:'pending',time:'Waiting for parent approval'},
  {id:4,name:'Take out the recycling',category:'outdoor',icon:'♻️',points:20,source:'parent',status:'done',time:'Completed at 8:42 AM'}
];
const state = JSON.parse(localStorage.getItem('chorequest-state')) || {role:'student',points:740,chores:seedChores};
let filter='all';
const icons={home:'🧹',kitchen:'🍽️',school:'📚',outdoor:'🌿'};
const $=s=>document.querySelector(s); const $$=s=>[...document.querySelectorAll(s)];
function save(){localStorage.setItem('chorequest-state',JSON.stringify(state))}
function toast(message){const t=$('#toast');t.textContent=message;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2400)}
function renderWeek(){const days=['MON','TUE','WED','THU','FRI','SAT','SUN'];$('#week-strip').innerHTML=days.map((d,i)=>`<div class="day ${i<5?'done':''} ${i===5?'today':''}"><i>${i<5?'✓':i===5?'•':''}</i>${d}</div>`).join('')}
function renderChores(){
  const shown=state.chores.filter(c=>filter==='all'||c.status===filter);
  $('#chore-list').innerHTML=shown.length?shown.map(c=>`<div class="chore-item ${c.status==='done'?'done':''}" data-id="${c.id}"><button class="check" title="${state.role==='parent'&&c.status==='pending'?'Approve chore':'Mark complete'}"></button><div class="chore-copy"><div class="chore-icon">${c.icon}</div><div><div class="chore-name">${c.name}</div><div class="chore-meta">${c.time}</div></div></div><span class="status ${c.source==='parent'?'parent':''} ${c.status==='done'?'done':''}">${c.status==='pending'?'Needs approval':c.status==='done'?'Completed':c.source==='parent'?'From parent':'Self-added'}</span><span class="chore-points">+${c.points} pts</span></div>`).join(''):'<p style="color:#87938f;text-align:center;padding:25px">No chores here yet.</p>';
  $$('.check').forEach(b=>b.onclick=()=>toggleChore(Number(b.closest('.chore-item').dataset.id)));
  $('#all-count').textContent=state.chores.length;$('#nav-count').textContent=state.chores.filter(c=>c.status!=='done').length;
}
function toggleChore(id){const c=state.chores.find(x=>x.id===id);if(c.status==='done')return toast('This chore is already complete!');if(c.status==='pending'&&state.role==='student')return toast('A parent needs to approve this chore.');c.status='done';c.time=state.role==='parent'?'Approved by parent just now':'Completed just now';state.points+=c.points;save();render();toast(state.role==='parent'?`Approved! Alex earned ${c.points} points.`:`Great job! You earned ${c.points} points.`)}
function renderActivity(){const activities=[['JM','Mom approved “Finish math homework”','2 min ago','+25 pts'],['AM','You completed “Take out recycling”','Today, 8:42 AM','+20 pts'],['JM','Mom added a new reward','Yesterday','']];$('#activity-list').innerHTML=activities.map(a=>`<div class="activity"><div class="avatar">${a[0]}</div><p>${a[1]}<span>${a[2]}</span></p><b>${a[3]}</b></div>`).join('')}
function render(){
  $('#points-total').textContent=state.points;$('#reward-current').textContent=state.points;const pct=Math.min(100,state.points/10);$('#reward-bar').style.width=pct+'%';$('#points-needed').textContent=Math.max(0,1000-state.points)+' points';
  const parent=state.role==='parent';$('#user-name').textContent=parent?'Jamie Morgan':'Alex Morgan';$('#role-label').textContent=parent?'Parent account':'Student';$('#greeting').innerHTML=parent?'Good afternoon, Jamie! <span>👋</span>':'Hey, Alex! <span>👋</span>';$('#subtitle').textContent=parent?'Here’s how Alex is doing today.':'Ready to earn some points today?';$('#chore-heading').textContent=parent?"Alex’s chores":"Today’s chores";$('#chore-subheading').textContent=parent?'Review progress and approve self-added chores.':'You’ve got this! Knock these out and earn your points.';$('#points-note').textContent=parent?'Parent-added chores award the full point value.':'Student-added chores earn half points until a parent verifies them.';
  $$('[data-role]').forEach(b=>b.classList.toggle('active',b.dataset.role===state.role));renderChores()
}
$$('[data-role]').forEach(b=>b.onclick=()=>{state.role=b.dataset.role;save();render();toast(`Switched to ${state.role} view`)});
$$('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;$$('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));renderChores()});
$('#add-chore').onclick=()=>$('#chore-modal').showModal();
$('#chore-form').addEventListener('submit',e=>{e.preventDefault();const raw=Number($('#chore-points').value);const points=state.role==='student'?Math.max(1,Math.round(raw/2)):raw;state.chores.unshift({id:Date.now(),name:$('#chore-name').value,category:$('#chore-category').value,icon:icons[$('#chore-category').value],points,source:state.role==='parent'?'parent':'self',status:'todo',time:state.role==='parent'?'Added by parent just now':'Self-added · half points'});save();render();$('#chore-modal').close();e.target.reset();toast(`Chore added for ${points} points`)});
$('.mobile-menu').onclick=()=>$('.sidebar').classList.toggle('open');
$$('.nav-item').forEach(n=>n.onclick=()=>{$$('.nav-item').forEach(x=>x.classList.remove('active'));n.classList.add('active');$('.sidebar').classList.remove('open');if(n.dataset.view&&n.dataset.view!=='home')toast(`${n.textContent.trim()} view is ready for the next version`)});
$$('[data-view-jump]').forEach(b=>b.onclick=()=>toast(`${b.dataset.viewJump[0].toUpperCase()+b.dataset.viewJump.slice(1)} overview opened`));
renderWeek();renderActivity();render();
