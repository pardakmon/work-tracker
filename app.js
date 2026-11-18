import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, onValue, off } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyArsvrr91i14zle2l-NHGq1XaBqRrPf5bU",
  authDomain: "knucklehead-hunter.firebaseapp.com",
  databaseURL: "https://knucklehead-hunter-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "knucklehead-hunter",
  storageBucket: "knucklehead-hunter.firebasestorage.app",
  messagingSenderId: "916645723238",
  appId: "1:916645723238:web:cd112675c7279eae72c1a7",
  measurementId: "G-XRPSFQG2Y5"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let currentPhotoBase64 = null;
let currentShiftLogs = [];
let refDay1 = null;
let refDay2 = null;
let dataDay1 = {};
let dataDay2 = {};

// 날짜 포맷 유틸리티 (Date 객체 -> "YYYY-MM-DD")
function formatDate(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCurrentTimeString() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

// 현재 시각 기준 '근무 시작일' 계산 (새벽 0시~08시59분이면 전날을 근무일로 잡음)
function getCurrentShiftDateString() {
  const now = new Date();
  if (now.getHours() < 9) {
    now.setDate(now.getDate() - 1);
  }
  return formatDate(now);
}

// 밀리초(ms)를 "X시간 Y분" 형태로 변환
function formatDuration(ms) {
  if (ms <= 0) return "0분";
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}시간 ${minutes}분`;
  }
  return `${minutes}분`;
}

// 1. 카메라 촬영 및 날짜/시간 워터마크 삽입
const cameraInput = document.getElementById('camera-input');
const btnCamera = document.getElementById('btn-camera');
const previewContainer = document.getElementById('preview-container');
const photoPreview = document.getElementById('photo-preview');
const btnClearPhoto = document.getElementById('btn-clear-photo');

btnCamera.addEventListener('click', () => cameraInput.click());

cameraInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxWidth = 500;
      const scale = maxWidth / img.width;
      canvas.width = img.width > maxWidth ? maxWidth : img.width;
      canvas.height = img.width > maxWidth ? img.height * scale : img.height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // 사진 우측 하단 타임스탬프 새기기
      const todayStr = formatDate(new Date());
      const timestampText = `${todayStr} ${getCurrentTimeString()}`;
      const fontSize = Math.max(14, Math.floor(canvas.width * 0.036));
      ctx.font = `bold ${fontSize}px sans-serif`;
      
      const textMetrics = ctx.measureText(timestampText);
      const paddingX = 10;
      const paddingY = 6;
      const boxWidth = textMetrics.width + paddingX * 2;
      const boxHeight = fontSize + paddingY * 2;
      const boxX = canvas.width - boxWidth - 10;
      const boxY = canvas.height - boxHeight - 10;

      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

      ctx.fillStyle = "#facc15"; // 시인성이 높은 밝은 노란색 글씨
      ctx.textBaseline = "middle";
      ctx.fillText(timestampText, boxX + paddingX, boxY + boxHeight / 2);
      
      currentPhotoBase64 = canvas.toDataURL('image/jpeg', 0.65);
      photoPreview.src = currentPhotoBase64;
      previewContainer.style.display = 'flex';
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

function clearPhoto() {
  currentPhotoBase64 = null;
  cameraInput.value = '';
  previewContainer.style.display = 'none';
  photoPreview.src = '';
}

btnClearPhoto.addEventListener('click', clearPhoto);

// 2. 기록 저장 함수 (실제 달력 날짜 노드 아래에 저장)
function recordAction(actionName) {
  const actualToday = formatDate(new Date());
  const logRef = ref(db, `attendance_log/${actualToday}`);
  
  const payload = {
    timestamp: Date.now(),
    date_string: actualToday,
    time_string: getCurrentTimeString(),
    action: actionName
  };

  if (currentPhotoBase64) {
    payload.photo = currentPhotoBase64;
  }

  push(logRef, payload)
    .then(() => {
      clearPhoto();
      const currentShiftDate = getCurrentShiftDateString();
      if (datePicker.value !== currentShiftDate) {
        datePicker.value = currentShiftDate;
        loadShiftLogs(currentShiftDate);
      }
    })
    .catch((error) => {
      alert("저장 중 오류가 발생했습니다: " + error.message);
    });
}

document.getElementById('btn-return').addEventListener('click', () => recordAction('업무 시작 / 자리 복귀'));
document.getElementById('btn-bed').addEventListener('click', () => recordAction('대기실 누움'));
document.getElementById('btn-avoid').addEventListener('click', () => recordAction('전화 회피'));
document.getElementById('btn-out').addEventListener('click', () => recordAction('외출 / 기타 이탈'));

// 3. 24시간 근무일(선택일 09:00 ~ 익일 09:00) 데이터 병합 및 시간 합산
const datePicker = document.getElementById('date-picker');
const logListEl = document.getElementById('log-list');

function processAndRenderShift(shiftDateStr) {
  // 근무 시작(당일 09:00:00) ~ 종료(익일 09:00:00) 밀리초 계산
  const [y, m, d] = shiftDateStr.split('-').map(Number);
  const shiftStart = new Date(y, m - 1, d, 9, 0, 0, 0);
  const shiftEnd = new Date(y, m - 1, d + 1, 9, 0, 0, 0);
  const nextDateStr = formatDate(shiftEnd);

  document.getElementById('shift-range-label').textContent = `${shiftDateStr} 09:00 ~ ${nextDateStr} 09:00`;
  document.getElementById('print-shift-period').textContent = `대상 근무일: ${shiftDateStr} 09:00 ~ ${nextDateStr} 09:00`;

  const startMs = shiftStart.getTime();
  const endMs = shiftEnd.getTime();

  // 두 날짜의 데이터를 합쳐서 09:00 ~ 익일 09:00 사이 기록만 필터링 후 시간순 정렬
  const combinedRaw = [
    ...Object.entries(dataDay1 || {}).map(([key, val]) => ({ id: key, date_string: shiftDateStr, ...val })),
    ...Object.entries(dataDay2 || {}).map(([key, val]) => ({ id: key, date_string: nextDateStr, ...val }))
  ];

  const shiftEvents = combinedRaw
    .filter(item => item.timestamp >= startMs && item.timestamp < endMs)
    .sort((a, b) => a.timestamp - b.timestamp);

  currentShiftLogs = shiftEvents;

  // 상태별 누적 시간 계산
  let officeMs = 0;
  let bedMs = 0;
  let outMs = 0;
  let avoidCount = 0;

  let currentState = null; // 'office' | 'bed' | 'out'
  let lastStateTime = null;
  const nowMs = Date.now();
  // 현재 진행 중인 근무일이면 현재 시각까지 계산, 과거 근무일이면 익일 09:00까지 계산
  const effectiveEndMs = Math.min(nowMs, endMs);

  // 각 이벤트별 지속 시간 표시를 위해 계산
  shiftEvents.forEach((ev) => {
    if (ev.action === '전화 회피') {
      avoidCount += 1;
      return; // 전화 회피는 순간 이벤트이므로 기존 체류 상태를 유지함
    }

    // 이전 상태가 있었다면 이번 상태 변경 시점까지의 시간을 누적
    if (currentState && lastStateTime !== null) {
      const diff = ev.timestamp - lastStateTime;
      if (currentState === 'office') officeMs += diff;
      else if (currentState === 'bed') bedMs += diff;
      else if (currentState === 'out') outMs += diff;
    }

    // 새로운 상태로 전환
    if (ev.action === '업무 시작 / 자리 복귀') currentState = 'office';
    else if (ev.action === '대기실 누움') currentState = 'bed';
    else if (ev.action === '외출 / 기타 이탈') currentState = 'out';
    
    lastStateTime = ev.timestamp;
  });

  // 마지막 상태 이후 종료 시점(현재 또는 익일 09시)까지 남은 시간 합산
  if (currentState && lastStateTime !== null && effectiveEndMs > lastStateTime) {
    const tailDiff = effectiveEndMs - lastStateTime;
    if (currentState === 'office') officeMs += tailDiff;
    else if (currentState === 'bed') bedMs += tailDiff;
    else if (currentState === 'out') outMs += tailDiff;
  }

  // 상단 요약 카드 업데이트
  document.getElementById('stat-office').textContent = formatDuration(officeMs);
  document.getElementById('stat-bed').textContent = formatDuration(bedMs);
  document.getElementById('stat-out').textContent = formatDuration(outMs);
  document.getElementById('stat-avoid').textContent = `${avoidCount}회`;

  // 타임라인 렌더링 (시간순으로 출력해야 보고서 읽기에 자연스러움)
  logListEl.innerHTML = '';
  if (shiftEvents.length === 0) {
    logListEl.innerHTML = '<li class="empty">해당 근무일(09:00 ~ 익일 09:00)에 기록된 내역이 없습니다.</li>';
    return;
  }

  shiftEvents.forEach((item) => {
    const li = document.createElement('li');
    const shortDate = item.date_string.slice(5); // "MM-DD"
    let htmlContent = `
      <div class="log-meta">
        <span class="date-badge">${shortDate}</span>
        <span class="time">${item.time_string}</span>
        <strong class="action">${item.action}</strong>
      </div>
    `;
    
    if (item.photo) {
      htmlContent += `<img src="${item.photo}" class="log-photo" title="클릭하면 새 창에서 크게 봅니다" onclick="window.open(this.src)">`;
    }
    
    li.innerHTML = htmlContent;
    logListEl.appendChild(li);
  });
}

function loadShiftLogs(shiftDateStr) {
  if (refDay1) off(refDay1);
  if (refDay2) off(refDay2);

  dataDay1 = {};
  dataDay2 = {};

  const [y, m, d] = shiftDateStr.split('-').map(Number);
  const nextDateObj = new Date(y, m - 1, d + 1);
  const nextDateStr = formatDate(nextDateObj);

  refDay1 = ref(db, `attendance_log/${shiftDateStr}`);
  refDay2 = ref(db, `attendance_log/${nextDateStr}`);

  onValue(refDay1, (snap) => {
    dataDay1 = snap.val() || {};
    processAndRenderShift(shiftDateStr);
  });

  onValue(refDay2, (snap) => {
    dataDay2 = snap.val() || {};
    processAndRenderShift(shiftDateStr);
  });
}

// 초기 실행 시 현재 근무일 세팅
const initialShiftDate = getCurrentShiftDateString();
datePicker.value = initialShiftDate;
loadShiftLogs(initialShiftDate);

datePicker.addEventListener('change', (e) => {
  if (e.target.value) {
    loadShiftLogs(e.target.value);
  }
});

// 4. 제출용 PDF 보고서 인쇄/저장 버튼
document.getElementById('btn-pdf').addEventListener('click', () => {
  if (currentShiftLogs.length === 0) {
    alert("출력할 기록이 없습니다.");
    return;
  }
  window.print();
});

// 5. 엑셀(CSV) 다운로드 기능 (24시간 근무일 전체 내보내기)
document.getElementById('btn-export').addEventListener('click', () => {
  const shiftDateStr = datePicker.value;
  if (currentShiftLogs.length === 0) {
    alert("다운로드할 기록이 없습니다.");
    return;
  }

  let csvContent = "\uFEFF근무기준일,실제날짜,시간,상태,사진첨부여부\n";
  
  currentShiftLogs.forEach((item) => {
    const hasPhoto = item.photo ? "있음" : "없음";
    csvContent += `${shiftDateStr},${item.date_string},${item.time_string},"${item.action}",${hasPhoto}\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `근무보고서_${shiftDateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});