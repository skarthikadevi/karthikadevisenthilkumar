// Live Weather Dashboard JS (Tamil comments light)
// Uses Open-Meteo geocoding + forecast (no API key)

const $ = id => document.getElementById(id);
const qInput = $('q'), suggestions = $('suggestions'), detectBtn = $('detectBtn'), unitBtn = $('unitBtn');
const placeEl = $('place'), tempEl = $('temp'), summaryEl = $('summary'), humidEl = $('humid'), windEl = $('wind'), updEl = $('upd');
const forecastEl = $('forecast'), bigIcon = $('bigIcon'), spark = $('spark'), slider = $('slider'), hourPreview = $('hourPreview'), app = $('app');

let unit = 'C'; // 'C' or 'F'
let lastHourly = null; // currently displayed hourly temps (C)
let lastHourlyTimes = null; // currently displayed hourly times (ISO)
let lastHourlyAll = null; // full hourly temps from API (C)
let lastHourlyTimesAll = null; // full hourly times from API

// debounce helper
let dt;
function debounce(fn, ms=300){ return (...a)=>{ clearTimeout(dt); dt=setTimeout(()=>fn(...a), ms); }; }

// geocode (Open-Meteo)
async function geocode(q){
  if(!q) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`;
  const r = await fetch(url);
  if(!r.ok) return [];
  const d = await r.json();
  return d.results || [];
}

// fetch weather
async function fetchWeather(lat, lon){
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=temperature_2m,relativehumidity_2m,windspeed_10m&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto`;
  const r = await fetch(url);
  if(!r.ok) throw new Error('Weather fetch failed');
  return r.json();
}

// map weather code to icon/type
function mapCode(code){
  if(code===0) return {icon:'☀️',type:'sunny'};
  if(code<=3) return {icon:'⛅',type:'cloudy'};
  if(code>=45 && code<=48) return {icon:'🌫️',type:'cloudy'};
  if((code>=51 && code<=67) || (code>=80 && code<=82)) return {icon:'🌧️',type:'rain'};
  if(code>=71 && code<=77) return {icon:'❄️',type:'snow'};
  if(code>=95) return {icon:'⛈️',type:'rain'};
  return {icon:'🌤️',type:'cloudy'};
}

function applyTheme(t){
  app.classList.remove('bg-sunny','bg-cloudy','bg-rain','bg-snow');
  if(t==='sunny') app.classList.add('bg-sunny');
  if(t==='cloudy') app.classList.add('bg-cloudy');
  if(t==='rain') app.classList.add('bg-rain');
  if(t==='snow') app.classList.add('bg-snow');
}

function toF(c){ return Math.round((c*9/5)+32); }
function toC(f){ return Math.round((f-32)*5/9); }

// draw sparkline on canvas
function drawSpark(temps, selIdx=0){
  const c = spark, ctx = c.getContext('2d');
  ctx.clearRect(0,0,c.width,c.height);
  if(!temps || temps.length===0) return;
  // adjust for devicePixelRatio
  const DPR = window.devicePixelRatio || 1;
  if(c.width !== c.clientWidth * DPR){
    c.width = Math.floor(c.clientWidth * DPR);
    c.height = Math.floor(c.clientHeight * DPR);
  }
  const W = c.width, H = c.height, pad = 14 * DPR;
  const min = Math.min(...temps), max = Math.max(...temps), range = Math.max(1, max - min);
  ctx.beginPath();
  temps.forEach((v,i)=>{
    const x = pad + (i/(temps.length-1)) * (W - 2*pad);
    const y = H - pad - ((v - min)/range) * (H - 2*pad);
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.lineWidth = 3 * DPR; ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.stroke();
  // fill
  ctx.lineTo(W-pad, H-pad); ctx.lineTo(pad, H-pad); ctx.closePath();
  const g = ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'rgba(79,70,229,0.18)'); g.addColorStop(1,'rgba(79,70,229,0.02)');
  ctx.fillStyle = g; ctx.fill();
  // selected dot
  const selX = pad + (selIdx/(temps.length-1)) * (W - 2*pad);
  const selY = H - pad - ((temps[selIdx] - min)/range) * (H - 2*pad);
  ctx.beginPath(); ctx.arc(selX, selY, 6 * DPR, 0, Math.PI*2); ctx.fillStyle = 'white'; ctx.fill();
  ctx.beginPath(); ctx.arc(selX, selY, 4 * DPR, 0, Math.PI*2); ctx.fillStyle = 'rgba(79,70,229,1)'; ctx.fill();
}

// render current weather
function renderCurrent(placeName, data){
  placeEl.textContent = placeName;
  const cw = data.current_weather;
  const cel = Math.round(cw.temperature);
  tempEl.textContent = unit==='C' ? `${cel}°C` : `${toF(cel)}°F`;
  const code = (data.daily && data.daily.weathercode && data.daily.weathercode[0] !== undefined) ? data.daily.weathercode[0] : cw.weathercode;
  const m = mapCode(code);
  bigIcon.textContent = m.icon;
  const tmax = Math.round(data.daily.temperature_2m_max[0]||0), tmin = Math.round(data.daily.temperature_2m_min[0]||0);
  summaryEl.textContent = `${m.icon} ${m.type} • Max ${unit==='C'?tmax+'°C':toF(tmax)+'°F'} • Min ${unit==='C'?tmin+'°C':toF(tmin)+'°F'}`;
  humidEl.textContent = (data.hourly && data.hourly.relativehumidity_2m && data.hourly.relativehumidity_2m[0]!==undefined)? data.hourly.relativehumidity_2m[0]+'%':'--';
  windEl.textContent = (cw.windspeed||'--') + ' m/s';
  updEl.textContent = new Date().toLocaleString();
  applyTheme(m.type);
}

// render forecast tiles
function renderForecast(daily){
  forecastEl.innerHTML = '';
  if(!daily || !daily.time) return;
  daily.time.forEach((d,i)=>{
    const dt = new Date(d);
    const label = dt.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
    const wc = daily.weathercode[i];
    const m = mapCode(wc);
    const max = Math.round(daily.temperature_2m_max[i]||0), min = Math.round(daily.temperature_2m_min[i]||0);
    const div = document.createElement('div'); div.className = 'day';
    div.innerHTML = `<div style="font-weight:600">${label}</div><div style="font-size:26px;margin:6px 0">${m.icon}</div><div class="small">${unit==='C'?max+'°/'+min+'°':toF(max)+'°/'+toF(min)+'°'}</div>`;
    div.addEventListener('click', ()=> previewDay(i));
    forecastEl.appendChild(div);
  });
}

// make day slices from full hourly arrays
function slicesFromHourly(times, temps){
  const days = {};
  times.forEach((t,i)=>{
    const dkey = new Date(t).toISOString().slice(0,10);
    if(!days[dkey]) days[dkey] = {date:dkey, times:[], temps:[]};
    days[dkey].times.push(t); days[dkey].temps.push(temps[i]);
  });
  return Object.values(days);
}

// preview a day by index (index into daily array)
function previewDay(dayIndex){
  if(!lastHourlyTimesAll || !lastHourlyAll) return;
  const slices = slicesFromHourly(lastHourlyTimesAll, lastHourlyAll);
  if(dayIndex < 0 || dayIndex >= slices.length) return;
  const s = slices[dayIndex];
  const times = s.times.slice(0,24), temps = s.temps.slice(0,24);
  lastHourly = temps.slice(); lastHourlyTimes = times.slice();
  const display = unit==='C' ? lastHourly.slice() : lastHourly.map(toF);
  drawSpark(display, 0);
  slider.max = Math.max(0, display.length - 1);
  slider.value = 0;
  hourPreview.textContent = new Date(lastHourlyTimes[0]).getHours() + ':00';
}

// selectPlace after geocode click
async function selectPlace(res){
  suggestions.style.display = 'none';
  const label = `${res.name}${res.admin1?', '+res.admin1:''}${res.country?', '+res.country:''}`;
  qInput.value = label;
  try {
    const data = await fetchWeather(res.latitude, res.longitude);
    if(data.hourly && data.hourly.time && data.hourly.temperature_2m){
      lastHourlyTimesAll = data.hourly.time.slice();
      lastHourlyAll = data.hourly.temperature_2m.slice();
      // initial 24-hr window around current hour
      const now = new Date();
      let startIdx = lastHourlyTimesAll.findIndex(t => new Date(t).getHours() === now.getHours());
      if(startIdx === -1) startIdx = 0;
      lastHourlyTimes = lastHourlyTimesAll.slice(startIdx, startIdx + 24);
      lastHourly = lastHourlyAll.slice(startIdx, startIdx + 24);
    } else {
      lastHourlyAll = lastHourlyTimesAll = lastHourly = lastHourlyTimes = null;
    }
    renderCurrent(label, data);
    renderForecast(data.daily);
    if(lastHourly){
      const display = unit==='C'? lastHourly.slice() : lastHourly.map(toF);
      drawSpark(display, 0);
      slider.max = Math.max(0, display.length - 1);
      slider.value = 0;
      hourPreview.textContent = new Date(lastHourlyTimes[0]).getHours() + ':00';
    }
  } catch(e){
    alert('Weather fetch failed: ' + e.message);
  }
}

// suggestion handler
const doSuggest = debounce(async ()=>{
  const v = qInput.value.trim();
  if(!v){ suggestions.style.display = 'none'; return; }
  suggestions.innerHTML = '<div style="padding:8px;color:rgba(148,163,184,1)">Searching...</div>'; suggestions.style.display = 'block';
  try {
    const arr = await geocode(v);
    suggestions.innerHTML = '';
    if(!arr || arr.length === 0){ suggestions.innerHTML = '<div style="padding:8px;color:rgba(148,163,184,1)">No results</div>'; return; }
    arr.forEach(r=>{
      const d = document.createElement('div'); d.textContent = `${r.name}${r.admin1?', '+r.admin1:''}${r.country?', '+r.country:''}`;
      d.addEventListener('click', ()=> selectPlace(r));
      suggestions.appendChild(d);
    });
  } catch(e){
    suggestions.innerHTML = '<div style="padding:8px;color:rgba(148,163,184,1)">Error</div>';
  }
}, 300);

qInput.addEventListener('input', doSuggest);
qInput.addEventListener('focus', ()=> { if(suggestions.innerHTML) suggestions.style.display = 'block'; });
document.addEventListener('click', (ev)=> { if(!qInput.contains(ev.target) && !suggestions.contains(ev.target)) suggestions.style.display = 'none'; });

// detect location
detectBtn.addEventListener('click', ()=>{
  if(!navigator.geolocation){ alert('Geolocation not supported'); return; }
  detectBtn.textContent = 'Detecting...';
  navigator.geolocation.getCurrentPosition(async pos=>{
    try {
      const lat = pos.coords.latitude, lon = pos.coords.longitude;
      const data = await fetchWeather(lat, lon);
      const label = `Lat ${lat.toFixed(3)}, Lon ${lon.toFixed(3)}`;
      qInput.value = label;
      if(data.hourly && data.hourly.time && data.hourly.temperature_2m){
        lastHourlyTimesAll = data.hourly.time.slice();
        lastHourlyAll = data.hourly.temperature_2m.slice();
        const now = new Date();
        let startIdx = lastHourlyTimesAll.findIndex(t => new Date(t).getHours() === now.getHours());
        if(startIdx === -1) startIdx = 0;
        lastHourlyTimes = lastHourlyTimesAll.slice(startIdx, startIdx + 24);
        lastHourly = lastHourlyAll.slice(startIdx, startIdx + 24);
      } else {
        lastHourlyAll = lastHourlyTimesAll = lastHourly = lastHourlyTimes = null;
      }
      renderCurrent(label, data);
      renderForecast(data.daily);
      if(lastHourly){
        const display = unit==='C'? lastHourly.slice() : lastHourly.map(toF);
        drawSpark(display, 0);
        slider.max = Math.max(0, display.length - 1);
        slider.value = 0;
        hourPreview.textContent = new Date(lastHourlyTimes[0]).getHours() + ':00';
      }
    } catch(e){ alert('Failed: ' + e.message); }
    finally { detectBtn.textContent = 'Detect my location'; }
  }, err=>{ alert('Location denied or unavailable'); detectBtn.textContent = 'Detect my location'; }, {timeout:10000});
});

// unit toggle
unitBtn.addEventListener('click', ()=>{
  unit = unit==='C' ? 'F' : 'C';
  unitBtn.textContent = unit==='C' ? '°C' : '°F';
  if(lastHourly){
    const display = unit==='C' ? lastHourly.slice() : lastHourly.map(toF);
    drawSpark(display, parseInt(slider.value||0));
  }
  // update current temp text if available
  const curMatch = tempEl.textContent.match(/(-?\d+)/);
  if(curMatch){
    let v = parseInt(curMatch[1]);
    if(unit === 'F') v = toF(unit === 'C' ? v : toC(v));
    else v = toC(unit === 'F' ? v : toF(v));
    tempEl.textContent = v + '°' + unit;
  }
});

// slider interaction
slider.addEventListener('input', ()=>{
  const i = parseInt(slider.value);
  hourPreview.textContent = lastHourlyTimes && lastHourlyTimes[i] ? new Date(lastHourlyTimes[i]).getHours() + ':00' : i + ':00';
  if(!lastHourly) return;
  const display = unit === 'C' ? lastHourly : lastHourly.map(toF);
  drawSpark(display, i);
});

// initial load (example city)
(async ()=>{
  try {
    const res = await geocode('Chennai');
    if(res && res[0]) selectPlace(res[0]);
  } catch(e){ console.warn('initial load failed'); }
})();
