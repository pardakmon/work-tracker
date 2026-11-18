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

// 상태 관리 변수
let currentPhotoBase64 = null;
let currentLogsArray = [];
let currentListeningRef = null;

// 날짜/시간 유틸리티 함수
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCurrentTimeString() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

// 1. 카메라 촬영, 리사이징 및 날짜/시간 워터마크 삽입
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
      // 가로 최대 500px로 리사이징
      const canvas = document.createElement('canvas');
      const maxWidth = 500;
      const scale = maxWidth / img.width;
      canvas.width = img.width > maxWidth ? maxWidth : img.width;
      canvas.height = img.width > maxWidth ? img.height * scale : img.height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // 사진 우측 하단에 날짜 및 시간 타임스탬프 새기기
      const timestampText = `${getTodayDateString()} ${getCurrentTimeString()}`;
      const fontSize = Math.max(14, Math.floor(canvas.width * 0.036));
      ctx.font = `bold ${fontSize}px sans-serif`;
      
      const textMetrics = ctx.measureText(timestampText);
      const paddingX = 10;
      const paddingY = 6;
      const boxWidth = textMetrics.width + paddingX * 2;
      const boxHeight = fontSize + paddingY * 2;
      const boxX = canvas.width - boxWidth - 10;
      const boxY = canvas.height - boxHeight - 10;

      // 가독성을 위한 반투명 검은색 배경 박스
      ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
      ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

      // 흰색 날짜/시간 글씨
      ctx.fillStyle = "#ffffff";
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

// 2. 기록 저장 함수
function recordAction(actionName) {
  const today = getTodayDateString();
  const logRef = ref(db, `attendance_log/${today}`);
  
  const payload = {
    timestamp: Date.now(),
    time_string: getCurrentTimeString(),
    action: actionName
  };

  if (currentPhotoBase64) {
    payload.photo = currentPhotoBase64;
  }

  push(logRef, payload)
    .then(() => {
      clearPhoto();
      if (datePicker.value !== today) {
        datePicker.value = today;
        loadLogsByDate(today);
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

// 3. 날짜별 기록 조회 로직
const datePicker = document.getElementById('date-picker');
const logListEl = document.getElementById('log-list');

function loadLogsByDate(selectedDate) {
  if (currentListeningRef) {
    off(currentListeningRef);
  }

  currentListeningRef = ref(db, `attendance_log/${selectedDate}`);
  
  onValue(currentListeningRef, (snapshot) => {
    logListEl.innerHTML = '';
    const data = snapshot.val();
    
    if (!data) {
      currentLogsArray = [];
      logListEl.innerHTML = '<li class="empty">해당 날짜에 기록된 내역이 없습니다.</li>';
      return;
    }

    const rawEntries = Object.values(data);
    currentLogsArray = rawEntries;
    const displayEntries = [...rawEntries].reverse();
    
    displayEntries.forEach((item) => {
      const li = document.createElement('li');
      let htmlContent = `<span class="time">[${item.time_string}]</span> <span class="action">${item.action}</span>`;
      
      if (item.photo) {
        htmlContent += `<img src="${item.photo}" class="log-photo" title="클릭하면 새 창에서 크게 봅니다" onclick="window.open(this.src)">`;
      }
      
      li.innerHTML = htmlContent;
      logListEl.appendChild(li);
    });
  });
}

const initialDate = getTodayDateString();
datePicker.value = initialDate;
loadLogsByDate(initialDate);

datePicker.addEventListener('change', (e) => {
  if (e.target.value) {
    loadLogsByDate(e.target.value);
  }
});

// 4. 선택된 날짜 기록 엑셀(CSV) 다운로드 기능
document.getElementById('btn-export').addEventListener('click', () => {
  const selectedDate = datePicker.value;
  if (currentLogsArray.length === 0) {
    alert("다운로드할 기록이 없습니다.");
    return;
  }

  let csvContent = "\uFEFF날짜,시간,상태,사진첨부여부\n";
  
  currentLogsArray.forEach((item) => {
    const hasPhoto = item.photo ? "있음" : "없음";
    csvContent += `${selectedDate},${item.time_string},"${item.action}",${hasPhoto}\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `근태기록_${selectedDate}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});