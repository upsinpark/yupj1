const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const puppeteer = require('puppeteer');

let mainWindow;

// Electron 앱인지 확인
const isElectronApp = process.versions && process.versions.electron;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800,
    webPreferences: { 
      nodeIntegration: true, 
      contextIsolation: false,
      enableRemoteModule: true
    }
  });
  
  // 현재 폴더의 index.html 로드
  mainWindow.loadFile('index.html');
  
  // 개발 도구 열기 (디버깅용)
  // mainWindow.webContents.openDevTools();
}

// Electron 앱으로 실행된 경우에만 Electron 관련 코드 실행
if (isElectronApp) {
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
} else {
  // Node.js 스크립트로 실행된 경우 테스트 코드 실행
  console.log('이 프로그램은 Electron 앱입니다. npm start 명령어로 실행해주세요.');
  console.log('테스트 목적으로 실행하는 경우, 아래 함수를 직접 호출할 수 있습니다:');
  console.log('예: scrapeYoutubeChart("video", "south-korea", "daily")');
  
  // 테스트 실행 (필요시 주석 해제)
  // (async () => {
  //   try {
  //     const results = await scrapeYoutubeChart("video", "south-korea", "daily");
  //     console.log(`결과 ${results.length}개 찾음`);
  //   } catch (error) {
  //     console.error('테스트 오류:', error);
  //   }
  // })();
}

// 크롤링 함수
async function scrapeYoutubeChart(videoType, country, period) {
  let browser = null;
  
  try {
    console.log(`크롤링 시작: ${videoType}, ${country}, ${period}`);
    
    // 브라우저 실행 옵션 개선
    browser = await puppeteer.launch({
      headless: true, // 브라우저를 보이게 설정
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--disable-web-security',
        '--allow-running-insecure-content'
      ],
      ignoreHTTPSErrors: true
    });
    
    console.log('브라우저 실행 완료');
    
    const page = await browser.newPage();
    
    // 브라우저 설정 최적화
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // 리소스 로딩 최적화 - 이미지 차단 제거 (데이터 추출에 필요할 수 있음)
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (resourceType === 'font' || resourceType === 'media') {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    // 상태 업데이트
    if (isElectronApp && mainWindow) {
      mainWindow.webContents.send('update-status', '페이지 로딩 중...');
    } else {
      console.log('페이지 로딩 중...');
    }
    
    // URL 생성 및 페이지 이동
    const url = `https://playboard.co/chart/${videoType}/most-viewed-all-videos-in-${country}-${period}`;
    console.log(`이동할 URL: ${url}`);
    
    try {
      // 타임아웃 증가 및 waitUntil 옵션 변경
      console.log('페이지 로딩 시작...');
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      console.log('페이지 로딩 완료');
    } catch (error) {
      console.error('페이지 로딩 오류:', error);
      if (isElectronApp && mainWindow) {
        mainWindow.webContents.send('update-status', '페이지 로딩 중 오류 발생, 재시도 중...');
      } else {
        console.log('페이지 로딩 중 오류 발생, 재시도 중...');
      }
      
      // 다른 방식으로 재시도
      try {
        await page.goto(url, { waitUntil: 'load', timeout: 90000 });
      } catch (retryError) {
        console.error('재시도 로딩 오류:', retryError);
        // 계속 진행 (일부 콘텐츠라도 로드되었을 수 있음)
      }
    }
    
    // 페이지 로딩 대기 (추가 시간)
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    if (isElectronApp && mainWindow) {
      mainWindow.webContents.send('update-status', '데이터 스크롤 중...');
    } else {
      console.log('데이터 스크롤 중...');
    }
    
    // 개선된 스크롤 메커니즘
    console.log('스크롤 시작...');
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 300; // 스크롤 거리를 줄여서 더 세밀하게 스크롤
        const maxScrolls = 300; // 최대 스크롤 횟수 증가
        let scrollCount = 0;
        let lastHeight = 0;
        let noChangeCount = 0;
        
        const timer = setInterval(async () => {
          window.scrollBy(0, distance);
          totalHeight += distance;
          scrollCount++;
          
          // 현재 스크롤 높이 확인
          const scrollHeight = document.documentElement.scrollHeight;
          const currentHeight = window.innerHeight + window.scrollY;
          
          // 스크롤이 변화가 없는지 확인
          if (Math.abs(currentHeight - lastHeight) < 10) {
            noChangeCount++;
          } else {
            noChangeCount = 0;
          }
          
          // 디버깅용 로그
          console.log(`현재 높이: ${currentHeight}, 전체 높이: ${scrollHeight}, 변화 없음: ${noChangeCount}`);
          
          // 스크롤이 끝에 도달했거나, 최대 스크롤 횟수에 도달했거나,
          // 30번 연속으로 높이 변화가 없는 경우 종료
          if (currentHeight >= scrollHeight - 50 || 
              scrollCount >= maxScrolls || 
              noChangeCount >= 30) {
            
            // 마지막으로 한 번 더 끝까지 스크롤
            window.scrollTo(0, scrollHeight);
            
            // 추가 대기 시간
            await new Promise(r => setTimeout(r, 2000));
            
            clearInterval(timer);
            resolve();
          }
          
          lastHeight = currentHeight;
        }, 500); // 스크롤 간격을 늘려서 로딩 시간 확보
      });
    });
    
    // 스크롤 완료 후 추가 대기 시간
    console.log('스크롤 완료, 추가 대기 중...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    if (isElectronApp && mainWindow) {
      mainWindow.webContents.send('update-status', '데이터 추출 중...');
    } else {
      console.log('데이터 추출 중...');
    }
    
    // 디버깅을 위한 스크린샷 저장
    await page.screenshot({ path: 'before-extraction.png' });
    
    // 데이터 추출
    console.log('데이터 추출 시작...');
    const items = await page.evaluate(() => {
      const results = [];
      const maxItems = 100; // 최대 100개 항목 수집
      
      // 다양한 선택자 시도
      let rows = document.querySelectorAll('.chart__row');
      
      if (!rows || rows.length === 0) {
        rows = document.querySelectorAll('.chart-list-row');
      }
      
      if (!rows || rows.length === 0) {
        rows = document.querySelectorAll('.video-list-item');
      }
      
      if (!rows || rows.length === 0) {
        rows = document.querySelectorAll('.video-item');
      }
      
      if (!rows || rows.length === 0) {
        rows = document.querySelectorAll('.item-card');
      }
      
      if (!rows || rows.length === 0) {
        rows = document.querySelectorAll('.video-card');
      }
      
      if (!rows || rows.length === 0) {
        // 페이지 구조 변경에 대응하기 위한 일반적인 선택자 시도
        rows = document.querySelectorAll('[data-rank]');
      }
      
      if (!rows || rows.length === 0) {
        rows = document.querySelectorAll('[class*="rank"]');
      }
      
      if (!rows || rows.length === 0) {
        rows = document.querySelectorAll('[class*="video"]');
      }
      
      if (!rows || rows.length === 0) {
        rows = document.querySelectorAll('[class*="chart"]');
      }
      
      if (!rows || rows.length === 0) {
        rows = document.querySelectorAll('[class*="item"]');
      }
      
      if (!rows || rows.length === 0) {
        rows = document.querySelectorAll('[class*="card"]');
      }
      
      // 마지막 시도: 모든 테이블 행 선택
      if (!rows || rows.length === 0) {
        rows = document.querySelectorAll('tr');
      }
      
      // 페이지 구조를 파악할 수 없는 경우
      if (!rows || rows.length === 0) {
        console.error('차트 데이터를 찾을 수 없습니다.');
        return [];
      }
      
      // 디버깅 정보
      console.log(`찾은 행 수: ${rows.length}`);
      
      // 각 행 처리 (최대 100개까지만)
      Array.from(rows).slice(0, maxItems).forEach((row, index) => {
        try {
          // 다양한 선택자 시도
          const rankEl = row.querySelector('[data-v-7b2da703].rank .current') || 
                        row.querySelector('.rank .current') || 
                        row.querySelector('.rank-value') || 
                        row.querySelector('[class*="rank"]') ||
                        row.getAttribute('data-rank') ||
                        row.querySelector('[data-index]');

          // 순위 변동 정보 추출
          const fluctuationEl = row.querySelector('[data-v-7b2da703].fluc');
          let fluctuation = '';
          let fluctuationValue = '';
          
          if (fluctuationEl) {
            if (fluctuationEl.classList.contains('up')) {
              fluctuation = 'up';
            } else if (fluctuationEl.classList.contains('down')) {
              fluctuation = 'down';
            } else if (fluctuationEl.classList.contains('new')) {
              fluctuation = 'new';
            }
            
            const numEl = fluctuationEl.querySelector('.num');
            if (numEl) {
              fluctuationValue = numEl.textContent.trim();
            }
          }
                        
          const titleEl = row.querySelector('.title__label h3') || 
                         row.querySelector('.video-title') || 
                         row.querySelector('h3') || 
                         row.querySelector('[class*="title"]') ||
                         row.querySelector('a[href*="youtube"]') ||
                         row.querySelector('a[href*="youtu.be"]');
                         
          const viewsEl = row.querySelector('.score .fluc-label') || 
                         row.querySelector('.views-count') || 
                         row.querySelector('[class*="view"]') ||
                         row.querySelector('[class*="score"]') ||
                         row.querySelector('[class*="count"]');
                         
          const channelEl = row.querySelector('.channel .name') || 
                           row.querySelector('.channel-name') || 
                           row.querySelector('[class*="channel"]') ||
                           row.querySelector('[class*="author"]') ||
                           row.querySelector('[class*="creator"]');
          
          // 데이터 추출
          const rank = rankEl ? 
                      (typeof rankEl === 'string' ? rankEl : rankEl.textContent.trim()) : 
                      (index + 1).toString();
                      
          const title = titleEl ? titleEl.textContent.trim() : '';
          const views = viewsEl ? viewsEl.textContent.trim() : '';
          const channelName = channelEl ? channelEl.textContent.trim() : '';
          
          // NEW 표시 확인
          const newBadgeEl = row.querySelector('.fluc.new .new') || 
                            row.querySelector('[data-v-7b2da703].fluc.new .new') ||
                            row.querySelector('[class*="new"]') ||
                            row.querySelector('[class*="badge"]');
          const isNew = newBadgeEl ? true : false;
          
          // 썸네일 및 URL
          let videoId = '';
          let videoLink = null;
          
          // 비디오 링크 찾기
          const possibleLinks = [
            row.querySelector('.title__label'), 
            row.querySelector('a.video-link'),
            row.querySelector('a[href*="youtube"]'),
            row.querySelector('a[href*="youtu.be"]'),
            row.querySelector('a[href*="/video/"]'),
            ...Array.from(row.querySelectorAll('a')).filter(a => 
              a.href && (
                a.href.includes('youtube.com/watch') || 
                a.href.includes('youtu.be') || 
                a.href.includes('/video/')
              )
            )
          ].filter(Boolean);
          
          if (possibleLinks.length > 0) {
            videoLink = possibleLinks[0];
          }
          
          if (videoLink && videoLink.href) {
            const href = videoLink.href;
            if (href.includes('youtube.com/watch?v=')) {
              videoId = href.split('v=')[1]?.split('&')[0];
            } else if (href.includes('youtu.be/')) {
              videoId = href.split('youtu.be/')[1]?.split('?')[0];
            } else if (href.includes('/video/')) {
              videoId = href.split('/video/')[1]?.split('?')[0];
            }
          }
          
          // 썸네일 이미지 찾기
          let thumbnailUrl = '';
          if (videoId) {
            thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
          } else {
            const imgEl = row.querySelector('img[src*="ytimg"]') || 
                         row.querySelector('img[data-src*="ytimg"]') ||
                         row.querySelector('img');
            if (imgEl) {
              thumbnailUrl = imgEl.src || imgEl.getAttribute('data-src') || '';
            }
          }
          
          const videoUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : '';
          
          // 채널 정보
          const channelImg = row.querySelector('.channel .profile-image img') || 
                            row.querySelector('.channel-image img') ||
                            row.querySelector('img[class*="channel"]') ||
                            row.querySelector('img[class*="profile"]');
                            
          let channelImageUrl = '';
          
          if (channelImg) {
            channelImageUrl = channelImg.src || channelImg.getAttribute('data-src') || '';
          }
          
          // 채널 링크 찾기
          const channelLinkEl = row.querySelector('.channel__wrapper') || 
                               row.querySelector('.channel-link') ||
                               row.querySelector('a[href*="channel"]') ||
                               row.querySelector('a[class*="channel"]');
                               
          const channelLink = channelLinkEl?.href || '';
          let channelId = '';
          
          if (channelLink.includes('channelId=')) {
            channelId = channelLink.split('channelId=')[1]?.split('&')[0];
          } else if (channelLink.includes('/channel/')) {
            channelId = channelLink.split('/channel/')[1]?.split('?')[0];
          } else if (channelLink.includes('/c/')) {
            channelId = channelLink.split('/c/')[1]?.split('?')[0];
          } else if (channelLink.includes('/user/')) {
            channelId = channelLink.split('/user/')[1]?.split('?')[0];
          }
          
          const channelUrl = channelId ? 
                            (channelId.startsWith('UC') ? 
                              `https://www.youtube.com/channel/${channelId}` : 
                              `https://www.youtube.com/c/${channelId}`) : 
                            '';
          
          // 최소한 순위나 제목이 있는 경우에만 결과에 추가
          if (rank || title) {
            // 필수 데이터가 모두 있는 경우에만 추가 (순위, 제목, 조회수, 채널명)
            if (rank && title && views && channelName) {
              results.push({
                rank: rank || '순위 없음',
                fluctuation,
                fluctuationValue, 
                thumbnailUrl, 
                title: title || '제목 없음', 
                views: views || '정보 없음',
                channelName: channelName || '정보 없음', 
                channelImageUrl, 
                channelUrl, 
                videoUrl,
                isNew: fluctuation === 'new' // NEW 표시 수정
              });
            }
          }
        } catch (error) {
          console.error('항목 추출 오류:', error);
        }
      });
      
      return results;
    });
    
    // 결과가 없는 경우 처리
    if (!items || items.length === 0) {
      // 데이터를 찾을 수 없는 경우 스크린샷 저장
      await page.screenshot({ path: 'no-results.png' });
      console.error('데이터를 찾을 수 없습니다. 스크린샷을 저장했습니다.');
      
      // 대체 데이터 제공 (테스트용)
      return [
        {
          rank: '1',
          fluctuation: '',
          fluctuationValue: '',
          thumbnailUrl: '',
          title: '데이터를 가져올 수 없습니다. 잠시 후 다시 시도해주세요.',
          views: '-',
          channelName: '-',
          channelImageUrl: '',
          channelUrl: '',
          videoUrl: '',
          isNew: false
        }
      ];
    }
    
    console.log(`데이터 추출 완료: ${items.length}개 항목 찾음`);
    return items;
  } catch (error) {
    console.error('크롤링 오류:', error);
    
    // 오류 발생 시 대체 데이터 제공
    return [
      {
        rank: '오류',
        fluctuation: '',
        fluctuationValue: '',
        thumbnailUrl: '',
        title: `오류가 발생했습니다: ${error.message}`,
        views: '-',
        channelName: '-',
        channelImageUrl: '',
        channelUrl: '',
        videoUrl: '',
        isNew: false
      }
    ];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// IPC 통신
if (isElectronApp) {
  ipcMain.handle('scrape-chart', async (event, { videoType, country, period }) => {
    try {
      mainWindow.webContents.send('update-status', '크롤링 준비 중...');
      const results = await scrapeYoutubeChart(videoType, country, period);
      
      if (!results || results.length === 0) {
        mainWindow.webContents.send('update-status', '결과를 찾을 수 없습니다.');
      } else {
        mainWindow.webContents.send('update-status', `${results.length}개의 결과를 찾았습니다.`);
      }
      
      return results;
    } catch (error) {
      console.error('IPC 처리 오류:', error);
      mainWindow.webContents.send('update-status', `오류: ${error.message}`);
      throw error;
    }
  });
} 