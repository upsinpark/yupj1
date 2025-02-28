const { ipcRenderer } = require('electron');

// DOM 요소
const videoTypeSelect = document.getElementById('videoType');
const countrySelect = document.getElementById('country');
const periodSelect = document.getElementById('period');
const searchBtn = document.getElementById('searchBtn');
const statusEl = document.getElementById('status');
const resultsContainer = document.getElementById('results');

// 검색 버튼 클릭 이벤트
searchBtn.addEventListener('click', async () => {
  const videoType = videoTypeSelect.value;
  const country = countrySelect.value;
  const period = periodSelect.value;
  
  console.log('선택된 국가:', country); // 디버깅용 로그
  
  // UI 초기화
  statusEl.textContent = '크롤링 중...';
  statusEl.className = 'status';
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
  const resultsBody = document.getElementById('resultsBody');
  searchBtn.disabled = true;
  
  try {
    // 메인 프로세스에 크롤링 요청
    const data = await ipcRenderer.invoke('scrape-chart', { videoType, country, period });
    
    // 결과가 없는 경우
    if (!data || data.length === 0) {
      resultsBody.innerHTML = '<tr><td colspan="5" class="error">결과가 없습니다.</td></tr>';
      statusEl.textContent = '검색 결과가 없습니다.';
      return;
    }
    
    // 결과 초기화
    resultsBody.innerHTML = '';
    
    // 유효한 데이터만 필터링
    const validData = data.filter(item => 
      item.rank && 
      item.title && 
      item.channelName && 
      item.rank !== 'undefined' && 
      item.title !== 'undefined' && 
      item.channelName !== 'undefined'
    );
    
    // 모든 결과를 한 번에 표시
    validData.forEach(item => {
      const row = document.createElement('tr');
      
      // 순위 열
      const rankCell = document.createElement('td');
      rankCell.innerHTML = `
        <div class="rank">${item.rank}</div>
        <div class="fluctuation ${item.fluctuationType || ''}">
          ${item.fluctuation ? (item.fluctuationType === 'new' ? 'NEW' : (item.fluctuationType === 'up' ? '▲' : '▼') + item.fluctuation) : ''}
        </div>
      `;
      
      // 썸네일 열
      const thumbnailCell = document.createElement('td');
      if (item.thumbnailUrl && item.thumbnailUrl !== 'undefined') {
        thumbnailCell.innerHTML = `
          <a href="${item.videoUrl}" target="_blank">
            <img src="${item.thumbnailUrl}" alt="${item.title}" class="thumbnail">
          </a>
        `;
      } else {
        thumbnailCell.innerHTML = `
          <a href="${item.videoUrl}" target="_blank">
            <div class="thumbnail no-image">이미지 없음</div>
          </a>
        `;
      }
      
      // 제목 열
      const titleCell = document.createElement('td');
      const tags = item.tags && Array.isArray(item.tags) ? item.tags.filter(tag => tag && tag !== 'undefined') : [];
      const tagsHtml = tags.map(tag => `<span class="tag">${tag}</span>`).join('');
      
      titleCell.innerHTML = `
        <a href="${item.videoUrl}" target="_blank" class="video-title">${item.title}</a>
        ${tagsHtml ? `<div class="tags">${tagsHtml}</div>` : ''}
        ${item.date && item.date !== 'undefined' ? `<div class="date">${item.date}</div>` : ''}
      `;
      
      // 조회수 열
      const viewsCell = document.createElement('td');
      viewsCell.textContent = item.views && item.views !== 'undefined' ? item.views : '-';
      
      // 채널 열
      const channelCell = document.createElement('td');
      channelCell.innerHTML = `
        <div class="channel-info">
          <a href="${item.channelUrl && item.channelUrl !== 'undefined' ? item.channelUrl : '#'}" target="_blank" class="channel-link">
            ${item.channelImageUrl && item.channelImageUrl !== 'undefined' 
              ? `<img src="${item.channelImageUrl}" alt="${item.channelName}" class="channel-image">`
              : `<div class="channel-image no-image"></div>`
            }
            <div class="channel-details">
              <div class="channel-name">${item.channelName}</div>
              ${item.subscribers && item.subscribers !== 'undefined' 
                ? `<div class="subscribers">${item.subscribers}</div>`
                : ''
              }
            </div>
          </a>
        </div>
      `;
      
      // 행에 셀 추가
      row.appendChild(rankCell);
      row.appendChild(thumbnailCell);
      row.appendChild(titleCell);
      row.appendChild(viewsCell);
      row.appendChild(channelCell);
      
      // 테이블에 행 추가
      resultsBody.appendChild(row);
    });
    
    statusEl.textContent = `${validData.length}개의 결과를 찾았습니다.`;
  } catch (error) {
    console.error('크롤링 오류:', error);
    statusEl.textContent = '오류가 발생했습니다: ' + error.message;
    statusEl.className = 'status error';
    resultsBody.innerHTML = '<tr><td colspan="5" class="error">데이터를 불러오는 중 오류가 발생했습니다.</td></tr>';
  } finally {
    searchBtn.disabled = false;
  }
});

// 상태 업데이트 이벤트 리스너
ipcRenderer.on('update-status', (event, message) => {
  statusEl.textContent = message;
});

// 페이지 로드 시 국가 옵션 추가
document.addEventListener('DOMContentLoaded', () => {
  // 기존 옵션 유지하면서 새 옵션 추가
  const countries = [
    { value: 'south-korea', text: '한국' },
    { value: 'united-states', text: '미국' },
    { value: 'japan', text: '일본' },
    { value: 'spain', text: '스페인' },
    { value: 'india', text: '인도' }
  ];
  
  // 기존 옵션 제거
  countrySelect.innerHTML = '';
  
  // 새 옵션 추가
  countries.forEach(country => {
    const option = document.createElement('option');
    option.value = country.value;
    option.textContent = country.text;
    countrySelect.appendChild(option);
  });
}); 