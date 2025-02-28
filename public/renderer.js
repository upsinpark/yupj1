const { ipcRenderer } = require('electron');

// DOM 요소
const videoTypeSelect = document.getElementById('videoType');
const countrySelect = document.getElementById('country');
const periodSelect = document.getElementById('period');
const searchBtn = document.getElementById('searchBtn');
const statusEl = document.getElementById('status');
const resultsContainer = document.getElementById('results');

// 로딩 상태 표시 함수
function showLoading(isLoading) {
  searchBtn.disabled = isLoading;
  if (isLoading) {
    searchBtn.innerHTML = '<span class="loading-text">검색 중...</span>';
    searchBtn.classList.add('loading-button');
  } else {
    searchBtn.textContent = '검색';
    searchBtn.classList.remove('loading-button');
  }
}

// 결과 테이블 초기화 함수
function initResultsTable() {
  resultsContainer.innerHTML = `
    <table id="resultsTable" class="results-table">
      <thead>
        <tr>
          <th>순위</th>
          <th>썸네일</th>
          <th>제목</th>
          <th>조회수</th>
          <th>채널</th>
        </tr>
      </thead>
      <tbody id="resultsBody">
        <tr><td colspan="5" class="loading">데이터를 불러오는 중입니다...</td></tr>
      </tbody>
    </table>
  `;
  return document.getElementById('resultsBody');
}

// 오류 표시 함수
function showError(message) {
  const resultsBody = document.getElementById('resultsBody') || initResultsTable();
  resultsBody.innerHTML = `<tr><td colspan="5" class="error">${message}</td></tr>`;
  statusEl.textContent = message;
  statusEl.classList.add('error-status');
}

// 검색 버튼 클릭 이벤트
searchBtn.addEventListener('click', async () => {
  try {
    // 이전 오류 상태 초기화
    statusEl.classList.remove('error-status');
    
    const videoType = videoTypeSelect.value;
    const country = countrySelect.value;
    const period = periodSelect.value;
    
    // UI 초기화
    statusEl.textContent = '크롤링 준비 중...';
    const resultsBody = initResultsTable();
    showLoading(true);
    
    // 메인 프로세스에 크롤링 요청
    let data;
    try {
      data = await ipcRenderer.invoke('scrape-chart', { videoType, country, period });
    } catch (error) {
      console.error('IPC 통신 오류:', error);
      showError(`데이터를 불러오는 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`);
      return;
    }
    
    // 결과가 없는 경우
    if (!data || data.length === 0) {
      showError('검색 결과가 없습니다.');
      return;
    }
    
    // 결과 표시
    resultsBody.innerHTML = '';
    
    data.forEach(item => {
      // 누락된 데이터 처리
      const rank = item.rank || '-';
      const title = item.title || '제목 없음';
      const views = item.views || '-';
      const channelName = item.channelName || '채널 정보 없음';
      const videoUrl = item.videoUrl || '#';
      const channelUrl = item.channelUrl || '#';
      
      // 오류 메시지 확인
      if (rank === '오류') {
        showError(title);
        return;
      }
      
      resultsBody.innerHTML += `
        <tr>
          <td>
            <div class="rank">${rank}</div>
            ${item.fluctuation ? `
              <div class="fluc ${item.fluctuation}">
                ${item.fluctuation === 'up' ? '▲' : item.fluctuation === 'down' ? '▼' : ''}
                ${item.fluctuationValue ? `<span class="num">${item.fluctuationValue}</span>` : ''}
              </div>
            ` : ''}
            ${item.isNew ? '<div class="new-badge">NEW</div>' : ''}
          </td>
          <td>
            <a href="${videoUrl}" target="_blank" rel="noopener noreferrer">
              ${item.thumbnailUrl ? 
                `<img src="${item.thumbnailUrl}" alt="${title}" class="thumbnail" onerror="this.onerror=null; this.src=''; this.classList.add('no-image'); this.textContent='이미지 없음';">` : 
                `<div class="thumbnail no-image">이미지 없음</div>`
              }
            </a>
          </td>
          <td>
            <a href="${videoUrl}" target="_blank" rel="noopener noreferrer" class="video-title">${title}</a>
            ${item.isNew ? '<span class="new-label">NEW</span>' : ''}
          </td>
          <td>${views}</td>
          <td>
            <div class="channel-info">
              <a href="${channelUrl}" target="_blank" rel="noopener noreferrer" class="channel-link">
                ${item.channelImageUrl ? 
                  `<img src="${item.channelImageUrl}" alt="${channelName}" class="channel-image" onerror="this.onerror=null; this.src=''; this.classList.add('no-image');">` : 
                  `<div class="channel-image no-image"></div>`
                }
                <div class="channel-details">
                  <div class="channel-name">${channelName}</div>
                </div>
              </a>
            </div>
          </td>
        </tr>
      `;
    });
    
    // 오류 메시지가 있는지 확인
    const errorItem = data.find(item => item.rank === '오류');
    if (errorItem) {
      statusEl.textContent = errorItem.title;
      statusEl.classList.add('error-status');
    } else {
      statusEl.textContent = `${data.length}개의 결과를 찾았습니다.`;
    }
  } catch (error) {
    console.error('렌더러 오류:', error);
    showError(`처리 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`);
  } finally {
    showLoading(false);
  }
});

// 상태 업데이트 이벤트 리스너
ipcRenderer.on('update-status', (event, message) => {
  statusEl.textContent = message;
  
  // 오류 메시지인 경우 스타일 적용
  if (message.toLowerCase().includes('오류')) {
    statusEl.classList.add('error-status');
  } else {
    statusEl.classList.remove('error-status');
  }
});

// 페이지 로드 시 초기 상태 설정
document.addEventListener('DOMContentLoaded', () => {
  statusEl.textContent = '검색할 옵션을 선택하고 검색 버튼을 클릭하세요.';
  
  // 이미지 로드 오류 처리
  document.addEventListener('error', (e) => {
    const target = e.target;
    if (target.tagName.toLowerCase() === 'img') {
      target.style.display = 'none';
      const div = document.createElement('div');
      div.className = target.className + ' no-image';
      div.textContent = '이미지 없음';
      target.parentNode.replaceChild(div, target);
    }
  }, true);
  
  // 키보드 이벤트 처리 (Enter 키로 검색)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !searchBtn.disabled) {
      searchBtn.click();
    }
  });
}); 