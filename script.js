// Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";

// Firebase 설정 (프로젝트와 동일)
const firebaseConfig = {
  apiKey: "AIzaSyA8bmJF4XSkZiK8uK-ESwxs-1Rpc6GML4U",
  authDomain: "starbase-2accb.firebaseapp.com",
  projectId: "starbase-2accb",
  storageBucket: "starbase-2accb.firebasestorage.app",
  messagingSenderId: "1072209005540",
  appId: "1:1072209005540:web:20b90950a2f637a20755f1",
  measurementId: "G-1K7LMHR35W",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Chart.js 플러그인 등록
Chart.register(ChartDataLabels);

// 수동 닉네임 매핑 (대시보드와 정합)
const manualNicknameMap = new Map([
  ['사자랑 놀기바뻐', '재미있는 사자'],
  ['Ua214', 'ua213'],
  ['ua214', 'ua213'],
  // Min097, NT, Ms는 같은 사람
  ['NT', 'Min097'],
  ['Ms', 'Min097']
]);
const resolveNickname = (name) => manualNicknameMap.get(String(name||'').trim()) || String(name||'').trim();

// 데이터 저장소
let first = [];
let second = [];
let third = [];
let fourth = [];

// 원본 데이터 저장소 (필터링 전)
let firstOriginal = [];
let secondOriginal = [];
let thirdOriginal = [];
let fourthOriginal = [];

// 차트 인스턴스
const charts = {};

// 공통 유틸
function calculateCategoryScores(surveyData) {
  const scores = {
    '내적 매력 인지 명확성': 0,
    '관계적 자신감': 0,
    '자기 수용': 0,
    '로젠버그 자아존중감 척도': 0,
    '일반적 자기효능감 척도': 0,
  };
  const counts = { ...Object.fromEntries(Object.keys(scores).map(k => [k, 0])) };
  if (!surveyData || !surveyData.likertResponses) return null;
  Object.values(surveyData.likertResponses).forEach(r => {
    if (!r || !r.scale) return;
    const v = (r.reversedValue !== undefined) ? r.reversedValue : r.value;
    if (scores.hasOwnProperty(r.scale) && typeof v === 'number') {
      scores[r.scale] += v;
      counts[r.scale] += 1;
    }
  });
  Object.keys(scores).forEach(cat => {
    scores[cat] = counts[cat] > 0 ? +(scores[cat] / counts[cat]).toFixed(3) : NaN;
  });
  return scores;
}

function averageFiveCategoryScore(resp) {
  const s = calculateCategoryScores(resp);
  if (!s) return NaN;
  const vals = Object.values(s).filter(v => !isNaN(v));
  if (!vals.length) return NaN;
  return vals.reduce((a,b)=>a+b,0)/vals.length;
}

function welchT(groupA, groupB) {
  const mean = arr => arr.reduce((a,b)=>a+b,0)/arr.length;
  const variance = (arr, m) => arr.reduce((a,b)=>a+(b-m)*(b-m),0)/(arr.length-1);
  const n1 = groupA.length, n2 = groupB.length;
  const m1 = mean(groupA), m2 = mean(groupB);
  const v1 = variance(groupA, m1), v2 = variance(groupB, m2);
  const se = Math.sqrt(v1/n1 + v2/n2);
  const t = (m1 - m2) / se;
  const df = Math.pow(v1/n1 + v2/n2, 2) / (Math.pow(v1/n1,2)/(n1-1) + Math.pow(v2/n2,2)/(n2-1));
  const p = twoTailedPValue(t, df);
  return { t, df, p, m1, m2 };
}

// Student's t CDF 근사 (정확도 충분)
function twoTailedPValue(t, df) {
  const x = Math.abs(t);
  const a = x / Math.sqrt(df);
  const b = df / (df + x*x);
  const betacdf = incompleteBeta(b, df/2, 0.5); // I_b(df/2, 1/2)
  const p = 2 * (0.5 * betacdf);
  return Math.min(1, Math.max(0, p));
}

// 불완전 베타함수 근사 (Cephes 기반 단순화)
function incompleteBeta(x, a, b) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(gammaln(a+b) - gammaln(a) - gammaln(b) + (a*Math.log(x)) + (b*Math.log(1-x)));
  if (x < (a+1)/(a+b+2)) {
    return bt * betacf(x, a, b) / a;
  } else {
    return 1 - bt * betacf(1-x, b, a) / b;
  }
}

function betacf(x, a, b) {
  const MAXIT = 100;
  const EPS = 3.0e-7;
  const FPMIN = 1.0e-30;
  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m=1, m2=2; m<=MAXIT; m++, m2+=2) {
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; d = 1/d;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; d = 1/d;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1.0) < EPS) break;
  }
  return h;
}

function gammaln(z) {
  const cof = [76.18009172947146,-86.50532032941677,24.01409824083091,-1.231739572450155,0.1208650973866179e-2,-0.5395239384953e-5];
  let x = z; let y = z; let tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j=0;j<6;j++) { y += 1; ser += cof[j]/y; }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function updateStatus(msg) { const el = document.getElementById('statusText'); if (el) el.textContent = msg; }

// 완전한 데이터를 가진 12명의 참여자 식별
function getCompleteParticipants() {
  const firstNicks = new Set(first.map(x => resolveNickname(x.anonymousNickname)).filter(Boolean));
  const secondNicks = new Set(second.map(x => resolveNickname(x.anonymousNickname)).filter(Boolean));
  const thirdNicks = new Set(third.map(x => resolveNickname(x.anonymousNickname)).filter(Boolean));
  const fourthNicks = new Set(fourth.map(x => resolveNickname(x.anonymousNickname)).filter(Boolean));
  
  // 1-4차 모두 응답한 참여자들
  const completeParticipants = [...firstNicks].filter(nick => 
    secondNicks.has(nick) && thirdNicks.has(nick) && fourthNicks.has(nick)
  );
  
  console.log('완전한 데이터를 가진 참여자들:', completeParticipants);
  console.log('총 완전 참여자 수:', completeParticipants.length);
  
  // 참여자 정보 표시 업데이트
  const infoEl = document.getElementById('participant-info');
  if (infoEl) {
    infoEl.textContent = `(완전 데이터 보유자: ${completeParticipants.length}명)`;
  }
  
  return completeParticipants;
}

// 완전 참여자들의 데이터만 필터링
function filterCompleteData() {
  const completeNicks = new Set(getCompleteParticipants());
  
  first = first.filter(x => completeNicks.has(resolveNickname(x.anonymousNickname)));
  
  // 2차 설문: 중복 제거 로직 추가
  const secondByNick = new Map();
  second.forEach(x => {
    const nick = resolveNickname(x.anonymousNickname);
    if (completeNicks.has(nick)) {
      if (!secondByNick.has(nick)) {
        secondByNick.set(nick, x);
      } else {
        const existing = secondByNick.get(nick);
        const existingTime = existing.timestamp?.toMillis() || 0;
        const newTime = x.timestamp?.toMillis() || 0;
        if (newTime > existingTime) {
          secondByNick.set(nick, x);
          console.log(`2차 설문 중복 제거: ${nick} - 이전 응답 교체`);
        }
      }
    }
  });
  second = Array.from(secondByNick.values());
  
  // 3차 설문: 중복 제거 로직 추가
  // 같은 닉네임으로 여러 번 응답한 경우 가장 최근 응답만 유지
  const thirdByNick = new Map();
  third.forEach(x => {
    const nick = resolveNickname(x.anonymousNickname);
    if (completeNicks.has(nick)) {
      // 이미 있는 경우 timestamp 비교 (나중 것 유지)
      if (!thirdByNick.has(nick)) {
        thirdByNick.set(nick, x);
      } else {
        const existing = thirdByNick.get(nick);
        const existingTime = existing.timestamp?.toMillis() || 0;
        const newTime = x.timestamp?.toMillis() || 0;
        if (newTime > existingTime) {
          thirdByNick.set(nick, x);
          console.log(`3차 설문 중복 제거: ${nick} - 이전 응답 교체`);
        }
      }
    }
  });
  third = Array.from(thirdByNick.values());
  
  fourth = fourth.filter(x => completeNicks.has(resolveNickname(x.anonymousNickname)));
  
  console.log(`중복 제거 후: 2차 ${second.length}개, 3차 ${third.length}개 (예상: ${completeNicks.size}개)`);
  
  updateStatus(`완전 데이터 필터링 완료: 1차 ${first.length}, 2차 ${second.length}, 3차 ${third.length}, 4차 ${fourth.length} (총 ${completeNicks.size}명)`);
}

async function loadAll() {
  updateStatus('Firebase에서 데이터를 불러오는 중...');
  const snap = await getDocs(collection(db, 'surveyResponses'));
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  // 분류
  first = all.filter(x => {
    const t = String(x.surveyType||'').toLowerCase().trim();
    return t === 'pre' || t === 'first' || (!x.surveyType && x.likertResponses);
  });
  second = all.filter(x => String(x.surveyType||'').toLowerCase().trim() === 'second');
  third = all.filter(x => String(x.surveyType||'').toLowerCase().trim() === 'third');
  fourth = all.filter(x => String(x.surveyType||'').toLowerCase().trim() === 'fourth');
  
  // 2차 설문 중복 확인
  console.log('=== 2차 설문 닉네임 분석 ===');
  const secondNickCounts = {};
  second.forEach(x => {
    const nick = resolveNickname(x.anonymousNickname);
    secondNickCounts[nick] = (secondNickCounts[nick] || 0) + 1;
  });
  
  const secondDuplicates = Object.entries(secondNickCounts).filter(([nick, count]) => count > 1);
  if (secondDuplicates.length > 0) {
    console.log('2차 설문 중복 응답자:', secondDuplicates);
    secondDuplicates.forEach(([nick, count]) => {
      const responses = second.filter(x => resolveNickname(x.anonymousNickname) === nick);
      console.log(`  ${nick}: ${count}개 응답`);
      responses.forEach((r, idx) => {
        console.log(`    응답 ${idx + 1}:`, {
          id: r.id,
          timestamp: r.timestamp?.toDate?.() || '없음',
          charmUnderstanding: r['charm-understanding'],
          positiveThinking: r['positive-thinking']
        });
      });
    });
  }
  
  // 3차 설문 중복 확인
  console.log('=== 3차 설문 닉네임 분석 ===');
  const thirdNickCounts = {};
  third.forEach(x => {
    const nick = resolveNickname(x.anonymousNickname);
    thirdNickCounts[nick] = (thirdNickCounts[nick] || 0) + 1;
  });
  
  // 중복된 닉네임 찾기
  const thirdDuplicates = Object.entries(thirdNickCounts).filter(([nick, count]) => count > 1);
  if (thirdDuplicates.length > 0) {
    console.log('3차 설문 중복 응답자:', thirdDuplicates);
    thirdDuplicates.forEach(([nick, count]) => {
      const responses = third.filter(x => resolveNickname(x.anonymousNickname) === nick);
      console.log(`  ${nick}: ${count}개 응답`);
      responses.forEach((r, idx) => {
        console.log(`    응답 ${idx + 1}:`, {
          id: r.id,
          timestamp: r.timestamp?.toDate?.() || '없음',
          Q1: r.followup_q1,
          Q2: r.followup_q2
        });
      });
    });
  }
  
  // 원본 데이터 백업
  firstOriginal = [...first];
  secondOriginal = [...second];
  thirdOriginal = [...third];
  fourthOriginal = [...fourth];
  
  updateStatus(`전체 데이터 불러옴: 1차 ${first.length}, 2차 ${second.length}, 3차 ${third.length}, 4차 ${fourth.length}`);
  
  // 완전한 데이터를 가진 참여자들만 필터링 (1-4차 분석용)
  filterCompleteData();
}

// -------------------- 방법 1: 하위그룹 분석 --------------------
function subgroupSplit(dimension) {
  const A = new Set();
  const B = new Set();
  const norm = s => String(s||'').trim();
  const normStyle = s => norm(s).replaceAll('·','/');
  first.forEach(f => {
    const nick = resolveNickname(f.anonymousNickname);
    if (!nick) return;
    if (dimension === 'external_internal') {
      const src = norm(f.selfEsteemSource);
      if (!src) return;
      // A = 외적동기: 타인의 인정, 외적 성과/지위/외모
      if (src.includes('타인의 인정') || src.includes('외적 성과') || src.includes('지위') || src.includes('외모')) {
        A.add(nick); return;
      }
      // B = 내적동기: 개인적 성장/역량, 가치 실현/기여감
      if (src.includes('개인적 성장') || src.includes('역량') || src.includes('가치 실현') || src.includes('기여감')) {
        B.add(nick); return;
      }
      // 친밀한 관계/소속감 등은 제외 (중간군)
    } else if (dimension === 'personality') {
      const per = norm(f.personality);
      if (!per) return;
      if (per.includes('낙관')) { A.add(nick); return; }
      if (per.includes('신중') || per.includes('냉소')) { B.add(nick); return; }
      // 현실적은 제외
    } else if (dimension === 'emotion_style') {
      const val = f['emotion-style'];
      if (!val) return;
      const arr = Array.isArray(val) ? val : [val];
      const has = t => arr.some(x => normStyle(x).includes(normStyle(t)));
      // A = 억제/내면화형
      if (has('억제/내면화형')) A.add(nick);
      // B = 즉시/솔직 표현형
      if (has('즉시/솔직 표현형')) B.add(nick);
    }
  });
  return { A: Array.from(A), B: Array.from(B) };
}

function indexByNick(arr) { const m = new Map(); arr.forEach(x => m.set(resolveNickname(x.anonymousNickname), x)); return m; }

function computeDeltaPerCategory(groupNicks, postMap) {
  const res = {};
  const fMap = indexByNick(first);
  groupNicks.forEach(nick => {
    const pre = fMap.get(nick); const post = postMap.get(nick);
    if (!pre || !post || !pre.likertResponses || !post.likertResponses) return;
    const sPre = calculateCategoryScores(pre);
    const sPost = calculateCategoryScores(post);
    Object.keys(sPre).forEach(cat => {
      const d = (sPost[cat] ?? NaN) - (sPre[cat] ?? NaN);
      if (!res[cat]) res[cat] = [];
      if (!isNaN(d)) res[cat].push(d);
    });
  });
  return res; // {cat: [delta,...]}
}

function computeMeansPerCategory(groupNicks, dataMap) {
  const fMap = indexByNick(first);
  const sums = { '내적 매력 인지 명확성':0,'관계적 자신감':0,'자기 수용':0,'로젠버그 자아존중감 척도':0,'일반적 자기효능감 척도':0 };
  const counts = { '내적 매력 인지 명확성':0,'관계적 자신감':0,'자기 수용':0,'로젠버그 자아존중감 척도':0,'일반적 자기효능감 척도':0 };
  groupNicks.forEach(nick => {
    const resp = dataMap.get(nick);
    if (!resp || !resp.likertResponses) return;
    const s = calculateCategoryScores(resp);
    Object.keys(sums).forEach(cat => {
      const v = s[cat];
      if (!isNaN(v)) { sums[cat] += v; counts[cat]++; }
    });
  });
  const means = {};
  Object.keys(sums).forEach(cat => { means[cat] = counts[cat] ? +(sums[cat]/counts[cat]).toFixed(3) : NaN; });
  return means;
}

function runSubgroup() {
  const dim = document.getElementById('subgroup-dimension').value;
  const postwave = document.getElementById('subgroup-postwave').value; // 'third'|'fourth'
  const postArr = postwave === 'fourth' ? fourth : third;
  const postMap = indexByNick(postArr);
  const { A, B } = subgroupSplit(dim);

  // 그룹 크기 표시 (콘솔과 화면에 모두)
  console.log(`그룹 A (${A.length}명):`, A);
  console.log(`그룹 B (${B.length}명):`, B);
  
  // 화면에 그룹 정보 표시
  updateStatus(`하위그룹 분석 완료 - 그룹A: ${A.length}명, 그룹B: ${B.length}명 (전체: ${A.length + B.length}명)`);

  const deltasA = computeDeltaPerCategory(A, postMap);
  const deltasB = computeDeltaPerCategory(B, postMap);

  const cats = ['내적 매력 인지 명확성','관계적 자신감','자기 수용','로젠버그 자아존중감 척도','일반적 자기효능감 척도'];
  const tbody = document.getElementById('subgroupTable');
  tbody.innerHTML = '';
  const meansA = [], meansB = [];
  cats.forEach(cat => {
    const a = deltasA[cat] || [];
    const b = deltasB[cat] || [];
    const mean = arr => arr.length ? (arr.reduce((x,y)=>x+y,0)/arr.length) : NaN;
    const mA = mean(a), mB = mean(b);
    meansA.push(isNaN(mA)?0:mA);
    meansB.push(isNaN(mB)?0:mB);
    let stats = { t: NaN, df: NaN, p: NaN };
    if (a.length>1 && b.length>1) stats = welchT(a, b);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${cat}</td>
      <td>${isNaN(mA)?'-':mA.toFixed(2)}</td>
      <td>${isNaN(mB)?'-':mB.toFixed(2)}</td>
      <td>${isNaN(stats.t)?'-':stats.t.toFixed(2)}</td>
      <td>${isNaN(stats.df)?'-':stats.df.toFixed(1)}</td>
      <td>${isNaN(stats.p)?'-':stats.p.toFixed(4)}</td>
    `;
    tbody.appendChild(tr);
  });

  // 차트
  const ctx = document.getElementById('subgroupDeltaChart').getContext('2d');
  if (charts.subgroupDeltaChart) charts.subgroupDeltaChart.destroy();
  // 라벨링
  let labelA = `그룹A(${A.length}명) Δ`;
  let labelB = `그룹B(${B.length}명) Δ`;
  if (dim === 'external_internal') { labelA = `외적동기(${A.length}명) Δ`; labelB = `내적동기(${B.length}명) Δ`; }
  if (dim === 'personality') { labelA = `낙관(${A.length}명) Δ`; labelB = `신중/냉소(${B.length}명) Δ`; }
  if (dim === 'emotion_style') { labelA = `억제/내면화(${A.length}명) Δ`; labelB = `즉시/솔직(${B.length}명) Δ`; }
  const hA = document.getElementById('sub-hA'); const hB = document.getElementById('sub-hB');
  if (hA && hB) { hA.textContent = labelA; hB.textContent = labelB; }
  charts.subgroupDeltaChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: cats, datasets: [
      { label: labelA, data: meansA, backgroundColor:'#667eea' },
      { label: labelB, data: meansB, backgroundColor:'#4ecdc4' },
    ]},
    options: { 
      responsive:true, 
      scales:{ y:{ beginAtZero:true } },
      plugins: {
        legend: {
          labels: {
            font: {
              size: window.innerWidth < 768 ? 10 : 12
            }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              label += context.parsed.y.toFixed(2);
              return label;
            }
          }
        },
        datalabels: {
          display: true,
          anchor: 'end',
          align: 'top',
          color: '#333',
          font: {
            size: window.innerWidth < 768 ? 9 : 10,
            weight: 'bold'
          },
          formatter: function(value, context) {
            return value.toFixed(2);
          }
        }
      }
    }
  });

  // Pre vs Post 그룹별 평균표 & 차트
  const preMap = indexByNick(first);
  const postMeansA = computeMeansPerCategory(A, postMap);
  const postMeansB = computeMeansPerCategory(B, postMap);
  const preMeansA = computeMeansPerCategory(A, preMap);
  const preMeansB = computeMeansPerCategory(B, preMap);

  // 표 렌더
  const t2 = document.getElementById('subgroupPrePostTable');
  t2.innerHTML = '';
  cats.forEach(cat => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${cat}</td>
      <td>${isNaN(preMeansA[cat])?'-':preMeansA[cat].toFixed(2)}</td>
      <td>${isNaN(postMeansA[cat])?'-':postMeansA[cat].toFixed(2)}</td>
      <td>${isNaN(preMeansB[cat])?'-':preMeansB[cat].toFixed(2)}</td>
      <td>${isNaN(postMeansB[cat])?'-':postMeansB[cat].toFixed(2)}</td>
    `;
    t2.appendChild(tr);
  });

  // 헤더 라벨
  const preAEl = document.getElementById('sub-hA-pre');
  const postAEl = document.getElementById('sub-hA-post');
  const preBEl = document.getElementById('sub-hB-pre');
  const postBEl = document.getElementById('sub-hB-post');
  const postLabel = (postwave === 'fourth') ? '4차' : '3차';
  const nameA = labelA.replace(/ Δ/, '');
  const nameB = labelB.replace(/ Δ/, '');
  if (preAEl) preAEl.textContent = `${nameA} 1차`;
  if (postAEl) postAEl.textContent = `${nameA} ${postLabel}`;
  if (preBEl) preBEl.textContent = `${nameB} 1차`;
  if (postBEl) postBEl.textContent = `${nameB} ${postLabel}`;

  // 차트 렌더
  const ctx2 = document.getElementById('subgroupPrePostChart').getContext('2d');
  if (charts.subgroupPrePostChart) charts.subgroupPrePostChart.destroy();
  charts.subgroupPrePostChart = new Chart(ctx2, {
    type: 'bar',
    data: {
      labels: cats,
      datasets: [
        { label: `${nameA} 1차`, data: cats.map(c=>preMeansA[c]), backgroundColor:'#c9d1e9' },
        { label: `${nameA} ${postLabel}`, data: cats.map(c=>postMeansA[c]), backgroundColor:'#667eea' },
        { label: `${nameB} 1차`, data: cats.map(c=>preMeansB[c]), backgroundColor:'#ffe29a' },
        { label: `${nameB} ${postLabel}`, data: cats.map(c=>postMeansB[c]), backgroundColor:'#4ecdc4' },
      ]
    },
    options: { 
      responsive:true, 
      scales:{ y:{ beginAtZero:true, max:4 } },
      plugins: {
        legend: {
          labels: {
            font: {
              size: window.innerWidth < 768 ? 9 : 11
            }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              label += context.parsed.y.toFixed(2);
              return label;
            }
          }
        }
      }
    }
  });
}

// -------------------- 방법 2: 문항수준 분석 --------------------
function gatherItemChanges(scaleName, postwave) {
  const postArr = postwave === 'fourth' ? fourth : third;
  const fMap = indexByNick(first);
  const pMap = indexByNick(postArr);
  const items = new Map(); // key: question text -> {pre:[], post:[]}
  const pushItem = (map, qText, v) => { if (!map.has(qText)) map.set(qText, { pre:[], post:[] }); v!=null && map.get(qText).push(v); };
  // 1) 수집
  Array.from(fMap.keys()).forEach(nick => {
    const pre = fMap.get(nick); const post = pMap.get(nick);
    if (!pre || !post || !pre.likertResponses || !post.likertResponses) return;
    const preItems = Object.values(pre.likertResponses).filter(r => r.scale === scaleName);
    const postItems = Object.values(post.likertResponses).filter(r => r.scale === scaleName);
    // question 텍스트 기준 매칭
    const byQPost = new Map(postItems.map(r => [r.question, r]));
    preItems.forEach(pr => {
      const po = byQPost.get(pr.question);
      const pv = (pr.reversedValue!==undefined)?pr.reversedValue:pr.value;
      const qv = po ? ((po.reversedValue!==undefined)?po.reversedValue:po.value) : null;
      const entry = items.get(pr.question) || { pre:[], post:[] };
      if (typeof pv === 'number') entry.pre.push(pv);
      if (typeof qv === 'number') entry.post.push(qv);
      items.set(pr.question, entry);
    });
  });
  // 2) 요약
  const rows = [];
  items.forEach((v, q) => {
    if (!v.pre.length || !v.post.length) return;
    const mean = arr => arr.reduce((a,b)=>a+b,0)/arr.length;
    const preM = mean(v.pre), postM = mean(v.post);
    rows.push({ question:q, pre:preM, post:postM, delta: postM - preM });
  });
  rows.sort((a,b)=> b.delta - a.delta);
  return rows;
}

// 텍스트 줄바꿈 함수
function wrapText(text, maxLength = 25) {
  if (text.length <= maxLength) return [text];
  
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  
  for (const word of words) {
    if ((currentLine + ' ' + word).length > maxLength) {
      if (currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        // 단어 자체가 너무 긴 경우는 강제로 자름
        lines.push(word.substring(0, maxLength));
        currentLine = word.substring(maxLength);
      }
    } else {
      currentLine = currentLine ? currentLine + ' ' + word : word;
    }
  }
  
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }
  
  return lines;
}

function runItem() {
  const scale = document.getElementById('item-scale').value;
  const postwave = document.getElementById('item-postwave').value;
  const rows = gatherItemChanges(scale, postwave);
  // 질문 텍스트를 줄바꿈 처리
  const labels = rows.map(r => wrapText(r.question, 25));
  const preVals = rows.map(r => +r.pre.toFixed(3));
  const postVals = rows.map(r => +r.post.toFixed(3));
  const deltaVals = rows.map(r => +r.delta.toFixed(3));

  const ctx = document.getElementById('itemBarChart').getContext('2d');
  if (charts.itemBarChart) charts.itemBarChart.destroy();
  charts.itemBarChart = new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets:[
      { label:'사전', data: preVals, backgroundColor:'#c9d1e9' },
      { label:'사후', data: postVals, backgroundColor:'#667eea' },
      { label:'Δ', data: deltaVals, backgroundColor: deltaVals.map(d=>d>=0?'#4ecdc4':'#ff6b6b') }
    ]},
    options:{ 
      responsive:true,
      maintainAspectRatio: false,
      indexAxis:'y', 
      scales:{ 
        x:{ 
          beginAtZero:true, 
          max:4,
          ticks: {
            font: {
              size: window.innerWidth < 768 ? 9 : 11
            }
          }
        },
        y: {
          ticks: {
            font: {
              size: window.innerWidth < 768 ? 8 : 11
            },
            maxRotation: 0,
            minRotation: 0,
            padding: window.innerWidth < 768 ? 4 : 8,
            autoSkip: false
          }
        }
      },
      layout: {
        padding: {
          left: window.innerWidth < 768 ? 5 : 10,
          right: window.innerWidth < 768 ? 15 : 30,
          top: 10,
          bottom: 10
        }
      },
      plugins: {
        legend: {
          display: window.innerWidth >= 768,
          labels: {
            font: {
              size: window.innerWidth < 768 ? 9 : 12
            }
          }
        },
        datalabels: {
          display: true,
          anchor: 'end',
          align: 'end',
          offset: 4,
          color: '#333',
          font: {
            size: window.innerWidth < 768 ? 0 : 9,
            weight: 'bold'
          },
          formatter: function(value, context) {
            return window.innerWidth < 768 ? '' : value.toFixed(2);
          }
        }
      }
    }
  });

  const box = document.getElementById('itemInsights');
  const top = rows[0]; const bottom = rows[rows.length-1];
  box.innerHTML = '';
  if (top) box.innerHTML += `<div><b>가장 크게 상승</b>: “${top.question}” <span class="pill">Δ ${top.delta.toFixed(2)}</span></div>`;
  if (bottom) box.innerHTML += `<div><b>가장 적게 변화</b>: “${bottom.question}” <span class="pill">Δ ${bottom.delta.toFixed(2)}</span></div>`;
}

// -------------------- 방법 3: 내용분석 --------------------
function collectTexts() {
  const useFirst = document.getElementById('src-first-selfdef').checked;
  const useSecond = document.getElementById('src-second-positive').checked;
  const useThird = document.getElementById('src-third-free').checked;
  const useThirdSelf = document.getElementById('src-third-selfdef').checked;
  const useFourthSelf = document.getElementById('src-fourth-selfdef').checked;
  const texts = [];
  if (useFirst) first.forEach(r => { if (r.selfDefinition && r.selfDefinition.trim()) texts.push(r.selfDefinition.trim()); });
  if (useSecond) second.forEach(r => { if (r.positiveExperience && r.positiveExperience.trim()) texts.push(r.positiveExperience.trim()); });
  if (useThird) third.forEach(r => { ['followup_q6','followup_q7','followup_q10','followup_q11','followup_q12'].forEach(k => { const t=r[k]; if (t && t.trim()) texts.push(t.trim()); }); });
  if (useThirdSelf) third.forEach(r => { if (r.selfDefinition && r.selfDefinition.trim()) texts.push(r.selfDefinition.trim()); });
  if (useFourthSelf) fourth.forEach(r => { if (r.selfDefinition && r.selfDefinition.trim()) texts.push(r.selfDefinition.trim()); });
  return texts;
}

const STOP = new Set(['그리고','그러나','하지만','또한','정말','너무','우리','내가','내','저','그','것','이','가','을','를','은','는','에','로','에서','하다','했다','된다','되었다','같다','생각','정도','조금','조금은','매우','아주','있는','했던','했던것','있다','된다','때문에']);

function tokenizeKorean(s) { return s.replace(/[\p{P}\p{S}]/gu,' ').split(/[\s\n\r\t]+/).map(x=>x.trim()).filter(Boolean); }

function buildFrequencies(texts) {
  const freq = new Map();
  texts.forEach(t => {
    tokenizeKorean(t).forEach(tok => {
      if (tok.length <= 1) return;
      if (STOP.has(tok)) return;
      freq.set(tok, (freq.get(tok)||0) + 1);
    });
  });
  return Array.from(freq.entries()).map(([term,count])=>({term,count})).sort((a,b)=>b.count-a.count);
}

let lastFreq = [];
function runContent() {
  const texts = collectTexts();
  lastFreq = buildFrequencies(texts);
  const top20 = lastFreq.slice(0,20);
  const ctx = document.getElementById('contentBarChart').getContext('2d');
  if (charts.contentBarChart) charts.contentBarChart.destroy();
  charts.contentBarChart = new Chart(ctx, {
    type:'bar',
    data:{ labels: top20.map(x=>x.term), datasets:[{ label:'빈도', data: top20.map(x=>x.count), backgroundColor:'#764ba2' }] },
    options:{ responsive:true, indexAxis:'y', scales:{ x:{ beginAtZero:true } } }
  });
  const list = document.getElementById('contentTop');
  list.innerHTML = top20.map(x=>`<span class="tag">${x.term} (${x.count})</span>`).join(' ');
}

function exportCSV() {
  if (!lastFreq || !lastFreq.length) return alert('먼저 단어빈도를 계산하세요.');
  const rows = [['term','count'], ...lastFreq.map(x=>[x.term, x.count])];
  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'content_frequencies.csv'; a.click(); URL.revokeObjectURL(url);
}

// 대응표본 T검정 및 Cohen's d 계산
function pairedTTest(preValues, postValues) {
  if (preValues.length !== postValues.length || preValues.length === 0) {
    return null;
  }
  
  const n = preValues.length;
  const differences = preValues.map((pre, i) => postValues[i] - pre);
  const meanDiff = differences.reduce((a, b) => a + b, 0) / n;
  const meanPre = preValues.reduce((a, b) => a + b, 0) / n;
  const meanPost = postValues.reduce((a, b) => a + b, 0) / n;
  
  // 표준편차 계산
  const variancePre = preValues.reduce((sum, val) => sum + Math.pow(val - meanPre, 2), 0) / (n - 1);
  const variancePost = postValues.reduce((sum, val) => sum + Math.pow(val - meanPost, 2), 0) / (n - 1);
  const varianceDiff = differences.reduce((sum, diff) => sum + Math.pow(diff - meanDiff, 2), 0) / (n - 1);
  
  const sdPre = Math.sqrt(variancePre);
  const sdPost = Math.sqrt(variancePost);
  const sdDiff = Math.sqrt(varianceDiff);
  const seDiff = sdDiff / Math.sqrt(n);
  
  // t값 계산
  const tValue = meanDiff / seDiff;
  const df = n - 1;
  const pValue = twoTailedPValue(tValue, df);
  
  // Cohen's d 계산 (pooled standard deviation 사용)
  const pooledSD = Math.sqrt((variancePre + variancePost) / 2);
  const cohensD = meanDiff / pooledSD;
  
  // 효과크기 해석
  let effectSizeInterpretation;
  const absCohensD = Math.abs(cohensD);
  if (absCohensD < 0.2) effectSizeInterpretation = '무시할만한';
  else if (absCohensD < 0.5) effectSizeInterpretation = '작은';
  else if (absCohensD < 0.8) effectSizeInterpretation = '중간';
  else effectSizeInterpretation = '큰';
  
  return {
    n,
    meanPre,
    meanPost,
    meanDiff,
    sdPre,
    sdPost,
    sdDiff,
    tValue,
    df,
    pValue,
    cohensD,
    effectSizeInterpretation
  };
}

function runPairedAnalysis() {
  console.log('1차-4차 대응표본 분석을 시작합니다...');
  
  // 1차와 4차 데이터에서 공통 참가자 찾기
  const firstMap = indexByNick(first);
  const fourthMap = indexByNick(fourth);
  
  const commonNicks = [];
  for (const nick of firstMap.keys()) {
    if (fourthMap.has(nick)) {
      commonNicks.push(nick);
    }
  }
  
  console.log(`공통 참가자: ${commonNicks.length}명`, commonNicks);
  
  if (commonNicks.length < 2) {
    alert('대응표본 분석을 위해서는 최소 2명의 공통 참가자가 필요합니다.');
    return;
  }
  
  const categories = ['내적 매력 인지 명확성', '관계적 자신감', '자기 수용', '로젠버그 자아존중감 척도', '일반적 자기효능감 척도'];
  const results = [];
  const chartDataPre = [];
  const chartDataPost = [];
  const chartDataCohen = [];
  const chartLabels = [];
  
  categories.forEach(category => {
    const preValues = [];
    const postValues = [];
    
    commonNicks.forEach(nick => {
      const firstData = firstMap.get(nick);
      const fourthData = fourthMap.get(nick);
      
      const firstScores = calculateCategoryScores(firstData);
      const fourthScores = calculateCategoryScores(fourthData);
      
      if (firstScores && fourthScores && 
          !isNaN(firstScores[category]) && !isNaN(fourthScores[category])) {
        preValues.push(firstScores[category]);
        postValues.push(fourthScores[category]);
      }
    });
    
    if (preValues.length > 1) {
      const result = pairedTTest(preValues, postValues);
      if (result) {
        results.push({
          category,
          ...result
        });
        
        chartDataPre.push(result.meanPre);
        chartDataPost.push(result.meanPost);
        chartDataCohen.push(Math.abs(result.cohensD));
        chartLabels.push(category.replace('척도', '').replace(' ', '\n'));
      }
    }
  });
  
  // 결과 테이블 업데이트
  updatePairedTTestTable(results);
  
  // 차트 업데이트
  updatePairedComparisonChart(chartLabels, chartDataPre, chartDataPost);
  updatePairedEffectSizeChart(chartLabels, chartDataCohen);
  
  // 개별 변화 표시
  updateIndividualChanges(commonNicks, firstMap, fourthMap);
  
  // 전역 변수에 결과 저장 (내보내기용)
  window.pairedAnalysisResults = results;
}

function updatePairedTTestTable(results) {
  const tbody = document.getElementById('pairedTTestTable');
  tbody.innerHTML = '';

  results.forEach(result => {
    const row = tbody.insertRow();
    row.innerHTML = `
      <td>${result.category}</td>
      <td>${result.meanPre.toFixed(2)} (${result.sdPre.toFixed(2)})</td>
      <td>${result.meanPost.toFixed(2)} (${result.sdPost.toFixed(2)})</td>
      <td>${result.meanDiff.toFixed(2)}</td>
      <td>${result.tValue.toFixed(2)}</td>
      <td>${result.df}</td>
      <td>${result.pValue < 0.001 ? '<0.001' : result.pValue.toFixed(3)}</td>
      <td>${result.cohensD.toFixed(2)}</td>
      <td>${result.effectSizeInterpretation}</td>
    `;

    // p값에 따른 행 스타일
    if (result.pValue < 0.05) {
      row.style.backgroundColor = '#f0f8ff';
      row.style.fontWeight = 'bold';
    }
  });
}

function updatePairedComparisonChart(labels, preData, postData) {
  const ctx = document.getElementById('pairedComparisonChart').getContext('2d');
  
  if (charts.pairedComparison) {
    charts.pairedComparison.destroy();
  }
  
  charts.pairedComparison = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: '1차 설문',
          data: preData,
          backgroundColor: 'rgba(54, 162, 235, 0.6)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 1
        },
        {
          label: '4차 설문',
          data: postData,
          backgroundColor: 'rgba(255, 99, 132, 0.6)',
          borderColor: 'rgba(255, 99, 132, 1)',
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
          max: 7
        }
      },
      plugins: {
        title: {
          display: true,
          text: '1차-4차 척도별 평균 비교'
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              label += context.parsed.y.toFixed(2);
              return label;
            }
          }
        }
      }
    },
    plugins: [{
      afterDatasetsDraw: function(chart) {
        const ctx = chart.ctx;
        chart.data.datasets.forEach((dataset, datasetIndex) => {
          const meta = chart.getDatasetMeta(datasetIndex);
          meta.data.forEach((bar, index) => {
            const data = dataset.data[index];
            ctx.fillStyle = '#000';
            ctx.font = 'bold 11px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(data.toFixed(2), bar.x, bar.y - 5);
          });
        });
      }
    }]
  });
}

function updatePairedEffectSizeChart(labels, cohenData) {
  const ctx = document.getElementById('pairedEffectSizeChart').getContext('2d');
  
  if (charts.pairedEffectSize) {
    charts.pairedEffectSize.destroy();
  }
  
  charts.pairedEffectSize = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: "Cohen's d (절댓값)",
        data: cohenData,
        backgroundColor: cohenData.map(d => {
          if (d < 0.2) return 'rgba(128, 128, 128, 0.6)'; // 무시할만한
          if (d < 0.5) return 'rgba(255, 206, 86, 0.6)';  // 작은
          if (d < 0.8) return 'rgba(75, 192, 192, 0.6)';  // 중간
          return 'rgba(255, 99, 132, 0.6)';               // 큰
        }),
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
          max: Math.max(1.5, ...cohenData) + 0.2
        }
      },
      plugins: {
        title: {
          display: true,
          text: '효과크기 (Cohen\'s d)'
        },
        legend: {
          display: true
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return "Cohen's d: " + context.parsed.y.toFixed(2);
            }
          }
        }
      }
    }
  });
}

function updateIndividualChanges(commonNicks, firstMap, fourthMap) {
  const container = document.getElementById('individualChanges');
  container.innerHTML = '';
  
  commonNicks.forEach(nick => {
    const firstData = firstMap.get(nick);
    const fourthData = fourthMap.get(nick);
    
    const firstScores = calculateCategoryScores(firstData);
    const fourthScores = calculateCategoryScores(fourthData);
    
    const firstAvg = averageFiveCategoryScore(firstData);
    const fourthAvg = averageFiveCategoryScore(fourthData);
    const change = fourthAvg - firstAvg;
    
    const div = document.createElement('div');
    div.style.padding = '8px';
    div.style.marginBottom = '4px';
    div.style.backgroundColor = change > 0 ? '#e8f5e8' : '#ffeaea';
    div.style.borderRadius = '4px';
    
    div.innerHTML = `
      <strong>${nick}</strong>: 
      1차 ${firstAvg.toFixed(2)} → 4차 ${fourthAvg.toFixed(2)} 
      (변화: ${change > 0 ? '+' : ''}${change.toFixed(2)})
    `;
    
    container.appendChild(div);
  });
}

function exportPairedResults() {
  if (!window.pairedAnalysisResults) {
    alert('먼저 대응표본 분석을 실행하세요.');
    return;
  }
  
  const headers = ['척도', '1차_평균', '1차_표준편차', '4차_평균', '4차_표준편차', '평균차이', 't값', '자유도', 'p값', 'Cohens_d', '효과크기'];
  const rows = [headers];
  
  window.pairedAnalysisResults.forEach(result => {
    rows.push([
      result.category,
      result.meanPre.toFixed(2),
      result.sdPre.toFixed(2),
      result.meanPost.toFixed(2),
      result.sdPost.toFixed(2),
      result.meanDiff.toFixed(2),
      result.tValue.toFixed(2),
      result.df,
      result.pValue.toFixed(6),
      result.cohensD.toFixed(2),
      result.effectSizeInterpretation
    ]);
  });
  
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'paired_sample_analysis.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// 이벤트 바인딩
document.getElementById('runSubgroup').addEventListener('click', runSubgroup);
document.getElementById('runItem').addEventListener('click', runItem);
document.getElementById('runPairedAnalysis').addEventListener('click', runPairedAnalysis);
document.getElementById('exportPairedResults').addEventListener('click', exportPairedResults);
document.getElementById('runSecondAnalysis').addEventListener('click', runSecondAnalysis);
document.getElementById('runThirdAnalysis').addEventListener('click', runThirdAnalysis);

// =====================================
// 2차 설문 분석
// =====================================
function runSecondAnalysis() {
  // 필터링된 데이터 사용 (1-4차 모두 응답한 12명)
  const secondData = second;
  
  const questions = [
    { key: 'charm-understanding', label: 'Q1: 매력 이해도 개선' },
    { key: 'positive-thinking', label: 'Q2: 긍정적 사고 도움' },
    { key: 'recommendation', label: 'Q3: 추천 의향' },
    { key: 'visualization-help', label: 'Q4: 시각화 기능 도움' }
  ];

  const stats = questions.map(q => {
    const values = secondData.map(s => parseInt(s[q.key])).filter(v => !isNaN(v));
    if (values.length === 0) return { label: q.label, mean: 0, sd: 0, min: 0, max: 0 };
    
    const mean = values.reduce((a,b) => a+b, 0) / values.length;
    const variance = values.reduce((a,b) => a + Math.pow(b - mean, 2), 0) / values.length;
    const sd = Math.sqrt(variance);
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    return { label: q.label, mean, sd, min, max };
  });

  // 차트 그리기
  if (charts.secondSurveyChart) charts.secondSurveyChart.destroy();
  const ctx = document.getElementById('secondSurveyChart').getContext('2d');
  charts.secondSurveyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: stats.map(s => s.label),
      datasets: [{
        label: '평균 점수',
        data: stats.map(s => s.mean),
        backgroundColor: 'rgba(102, 126, 234, 0.8)',
        borderColor: 'rgba(102, 126, 234, 1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
          max: 10,
          title: {
            display: true,
            text: '점수 (1-10)'
          }
        }
      },
      plugins: {
        title: {
          display: true,
          text: `2차 설문 평균 점수 (N=${secondData.length}, 1-4차 완전 응답자)`
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return '평균: ' + context.parsed.y.toFixed(2);
            }
          }
        },
        datalabels: {
          anchor: 'end',
          align: 'top',
          formatter: (value) => value.toFixed(2)
        }
      }
    }
  });

  // 통계 테이블 업데이트
  const tbody = document.getElementById('secondStatsTable');
  tbody.innerHTML = '';
  stats.forEach(s => {
    const row = tbody.insertRow();
    row.innerHTML = `
      <td>${s.label}</td>
      <td>${s.mean.toFixed(2)}</td>
      <td>${s.sd.toFixed(2)}</td>
      <td>${s.min}</td>
      <td>${s.max}</td>
    `;
  });

  // 긍정적 경험 리스트 업데이트
  const expList = document.getElementById('secondExperiencesList');
  expList.innerHTML = '';
  
  secondData.forEach(s => {
    if (s.positiveExperience && s.positiveExperience.trim()) {
      const div = document.createElement('div');
      div.style.padding = '8px';
      div.style.marginBottom = '8px';
      div.style.backgroundColor = '#f8f9fa';
      div.style.borderLeft = '4px solid #667eea';
      div.style.borderRadius = '4px';
      
      div.innerHTML = `
        <strong>${s.anonymousNickname || '익명'}</strong><br>
        <span style="color: #555;">${s.positiveExperience}</span>
      `;
      
      expList.appendChild(div);
    }
  });

  if (expList.children.length === 0) {
    expList.innerHTML = '<div class="muted">긍정적 경험 응답이 없습니다.</div>';
  }
}

// =====================================
// 3차 설문 분석
// =====================================
function runThirdAnalysis() {
  // 필터링된 데이터 사용 (1-4차 모두 응답한 12명)
  const thirdData = third;
  
  // Q2, Q3, Q5, Q8, Q9를 Q1~Q5로 재정렬
  const questions = [
    { key: 'followup_q2', label: 'Q1: 매력 개념 이해' },
    { key: 'followup_q3', label: 'Q2: 자기 생각 긍정적 변화' },
    { key: 'followup_q5', label: 'Q3: 주변에 추천' },
    { key: 'followup_q8', label: 'Q4: 자기이해·자기존중 관점 변화' },
    { key: 'followup_q9', label: 'Q5: 미래 계획/목표에 대한 도움' }
  ];

  const stats = questions.map(q => {
    const values = thirdData.map(t => parseInt(t[q.key])).filter(v => !isNaN(v));
    if (values.length === 0) return { label: q.label, mean: 0, sd: 0, min: 0, max: 0, count: 0 };
    
    const mean = values.reduce((a,b) => a+b, 0) / values.length;
    const variance = values.reduce((a,b) => a + Math.pow(b - mean, 2), 0) / values.length;
    const sd = Math.sqrt(variance);
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    return { label: q.label, mean, sd, min, max, count: values.length };
  });

  console.log('3차 설문 통계 (12명):', stats);

  // Q1~Q5 차트 그리기
  if (charts.thirdSurveyChart) charts.thirdSurveyChart.destroy();
  const ctx = document.getElementById('thirdSurveyChart').getContext('2d');
  charts.thirdSurveyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: stats.map(s => s.label),
      datasets: [{
        label: '평균 점수',
        data: stats.map(s => s.mean),
        backgroundColor: 'rgba(118, 75, 162, 0.8)',
        borderColor: 'rgba(118, 75, 162, 1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
          max: 10,
          title: {
            display: true,
            text: '점수 (1-10)'
          }
        }
      },
      plugins: {
        title: {
          display: true,
          text: `3차 설문 평균 점수 (Q1~Q5) (N=${thirdData.length}, 1-4차 완전 응답자)`
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return '평균: ' + context.parsed.y.toFixed(2);
            }
          }
        },
        datalabels: {
          anchor: 'end',
          align: 'top',
          formatter: (value) => value.toFixed(2)
        }
      }
    }
  });

  // 통계 테이블 업데이트
  const tbody = document.getElementById('thirdStatsTable');
  tbody.innerHTML = '';
  stats.forEach(s => {
    const row = tbody.insertRow();
    row.innerHTML = `
      <td>${s.label}</td>
      <td>${s.mean.toFixed(2)}</td>
      <td>${s.sd.toFixed(2)}</td>
      <td>${s.min}</td>
      <td>${s.max}</td>
    `;
  });

  // Q6, Q7 리스트 업데이트
  const q6q7List = document.getElementById('thirdQ6Q7List');
  q6q7List.innerHTML = '';
  
  thirdData.forEach(t => {
    if (t.followup_q6 && t.followup_q6.trim()) {
      const div = document.createElement('div');
      div.style.padding = '8px';
      div.style.marginBottom = '8px';
      div.style.backgroundColor = '#f8f9fa';
      div.style.borderLeft = '4px solid #764ba2';
      div.style.borderRadius = '4px';
      
      div.innerHTML = `
        <strong>${t.anonymousNickname || '익명'}</strong> (Q6)<br>
        <span style="color: #555;">${t.followup_q6}</span>
      `;
      
      q6q7List.appendChild(div);
    }
    
    if (t.followup_q7 && t.followup_q7.trim()) {
      const div = document.createElement('div');
      div.style.padding = '8px';
      div.style.marginBottom = '8px';
      div.style.backgroundColor = '#f8f9fa';
      div.style.borderLeft = '4px solid #764ba2';
      div.style.borderRadius = '4px';
      
      div.innerHTML = `
        <strong>${t.anonymousNickname || '익명'}</strong> (Q7)<br>
        <span style="color: #555;">${t.followup_q7}</span>
      `;
      
      q6q7List.appendChild(div);
    }
  });

  if (q6q7List.children.length === 0) {
    q6q7List.innerHTML = '<div class="muted">Q6, Q7 응답이 없습니다.</div>';
  }

  // Q10~Q12 리스트 업데이트
  const q10q12List = document.getElementById('thirdQ10Q12List');
  q10q12List.innerHTML = '';
  
  const freeQuestions = [
    { key: 'followup_q10', label: 'Q10' },
    { key: 'followup_q11', label: 'Q11' },
    { key: 'followup_q12', label: 'Q12' }
  ];
  
  thirdData.forEach(t => {
    freeQuestions.forEach(fq => {
      if (t[fq.key] && t[fq.key].trim()) {
        const div = document.createElement('div');
        div.style.padding = '8px';
        div.style.marginBottom = '8px';
        div.style.backgroundColor = '#f8f9fa';
        div.style.borderLeft = '4px solid #764ba2';
        div.style.borderRadius = '4px';
        
        div.innerHTML = `
          <strong>${t.anonymousNickname || '익명'}</strong> (${fq.label})<br>
          <span style="color: #555;">${t[fq.key]}</span>
        `;
        
        q10q12List.appendChild(div);
      }
    });
  });

  if (q10q12List.children.length === 0) {
    q10q12List.innerHTML = '<div class="muted">Q10~Q12 응답이 없습니다.</div>';
  }
}

// 초기화
loadAll().catch(err => {
  console.error(err);
  updateStatus('데이터 로드 오류: ' + err.message);
});



