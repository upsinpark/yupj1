const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const puppeteer = require('puppeteer');
const fs = require('fs');

let mainWindow;

// 쿠키 저장 경로
const cookiesPath = path.join(__dirname, 'cookies.json');

// 전역 브라우저 인스턴스
let globalBrowser = null;

const userDataDir = path.join(__dirname, 'chrome-data');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  mainWindow.loadFile('index.html');
  
  // 개발 시 개발자 도구 열기
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 더 효과적인 스크롤 함수
async function scrollUntilRankAppears(page, targetRank = 200) {
  await page.evaluate(async (targetRank) => {
    await new Promise((resolve) => {
      let maxRankFound = 0;
      let unchangedCount = 0;
      let previousMaxRank = 0;
      
      // 특정 순위 구간에서 추가 대기 설정
      const specialRanks = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 120, 140, 160, 180, 200];
      
      const checkInterval = setInterval(() => {
        // 현재 표시된 모든 순위 요소 확인
        const rankElements = document.querySelectorAll('.current--long');
        
        // 현재 발견된 최대 순위 확인
        rankElements.forEach(el => {
          const rank = parseInt(el.textContent.trim(), 10);
          if (!isNaN(rank) && rank > maxRankFound) {
            maxRankFound = rank;
          }
        });
        
        // 특정 순위에 도달했을 때 추가 대기
        if (specialRanks.includes(maxRankFound) && maxRankFound > previousMaxRank) {
          console.log(`특정 순위 ${maxRankFound}에 도달했습니다. 추가 대기...`);
          // 현재 위치에서 약간 위아래로 스크롤하여 이미지 로딩 촉진
          window.scrollBy(0, -200);
          setTimeout(() => {
            window.scrollBy(0, 400);
          }, 500);
        } else {
          // 일반적인 스크롤
          window.scrollBy(0, 800); // 더 천천히 스크롤
        }
        
        console.log(`현재 발견된 최대 순위: ${maxRankFound}`);
        
        // 목표 순위에 도달하거나, 더 이상 순위가 증가하지 않으면 종료
        if (maxRankFound >= targetRank) {
          console.log(`목표 순위(${targetRank})에 도달했습니다.`);
          clearInterval(checkInterval);
          
          // 마지막 스크롤 후 추가 대기
          setTimeout(resolve, 2000);
        } else if (maxRankFound === 0) {
          // 순위 요소를 찾지 못한 경우 계속 스크롤
          console.log('순위 요소를 찾지 못했습니다. 계속 스크롤합니다.');
        } else if (maxRankFound === previousMaxRank) {
          unchangedCount++;
          if (unchangedCount >= 5) {
            // 5번 연속으로 변화가 없으면 종료
            console.log(`더 이상 순위가 증가하지 않습니다. 최대 순위: ${maxRankFound}`);
            clearInterval(checkInterval);
            setTimeout(resolve, 2000);
          }
        } else {
          unchangedCount = 0;
        }
        
        previousMaxRank = maxRankFound;
      }, 1000); // 1초마다 체크 (더 긴 간격)
    });
  }, targetRank);
}

// 크롤링 함수
async function scrapeYoutubeChart(videoType, country, period) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu'
    ]
  });
  
  try {
    const page = await browser.newPage();
    
    // 이미지 로딩 허용
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      req.continue();
    });
    
    await page.setViewport({ width: 1920, height: 1080 });
    
    // URL 생성 및 페이지 이동
    const url = `https://playboard.co/chart/${videoType}/most-viewed-all-videos-in-${country}-${period}`;
    console.log(`크롤링 URL: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // 개선된 스크롤 함수 사용
    await scrollUntilRankAppears(page, 200);
    
    // 이미지 로딩을 위한 추가 작업
    await page.evaluate(async () => {
      // 모든 썸네일 요소 가져오기
      const thumbnails = document.querySelectorAll('.thumb');
      const profileImages = document.querySelectorAll('.channel .profile-image img');
      
      // 각 썸네일에 포커스하여 로딩 촉진
      for (const thumb of thumbnails) {
        thumb.scrollIntoView({ behavior: 'auto', block: 'center' });
        await new Promise(r => setTimeout(r, 100));
      }
      
      // 각 프로필 이미지에 포커스하여 로딩 촉진
      for (const img of profileImages) {
        img.scrollIntoView({ behavior: 'auto', block: 'center' });
        await new Promise(r => setTimeout(r, 100));
      }
      
      // 최종 대기
      return new Promise(resolve => setTimeout(resolve, 3000));
    });
    
    // 디버깅용 스크린샷
    await page.screenshot({ path: 'after-scroll.png', fullPage: false });
    
    // 데이터 추출 (강화된 이미지 추출 로직 사용)
    const chartData = await page.evaluate(() => {
      const items = [];
      const rows = document.querySelectorAll('.chart__row');
      
      rows.forEach(row => {
        try {
          // 순위
          const rank = row.querySelector('.rank .current')?.textContent.trim();
          
          // 변동 정보 추출 개선
          let fluctuation = '';
          let fluctuationType = '';
          const fluctuationElement = row.querySelector('.rank .fluc');
          if (fluctuationElement) {
            // 클래스명으로 타입 확인 (up, down, new 등)
            if (fluctuationElement.classList.contains('up')) {
              fluctuationType = 'up';
            } else if (fluctuationElement.classList.contains('down')) {
              fluctuationType = 'down';
            } else if (fluctuationElement.classList.contains('new')) {
              fluctuationType = 'new';
            }
            
            // 숫자 또는 텍스트 추출
            const numElement = fluctuationElement.querySelector('.num');
            const newElement = fluctuationElement.querySelector('.new');
            
            if (numElement) {
              fluctuation = numElement.textContent.trim();
            } else if (newElement) {
              fluctuation = newElement.textContent.trim();
            }
          }
          
          // 썸네일 추출 부분 강화
          const thumbnailElement = row.querySelector('.thumb');
          let thumbnailUrl = '';
          if (thumbnailElement) {
            try {
              // 방법 1: 배경 이미지에서 추출
              const bgImage = thumbnailElement.style.backgroundImage || '';
              if (bgImage) {
                // URL 형식에 따라 다르게 처리
                if (bgImage.includes('url("')) {
                  thumbnailUrl = bgImage.split('url("')[1].split('")')[0];
                } else if (bgImage.includes("url('")) {
                  thumbnailUrl = bgImage.split("url('")[1].split("')")[0];
                } else if (bgImage.includes('url(')) {
                  thumbnailUrl = bgImage.split('url(')[1].split(')')[0];
                  // 따옴표가 있으면 제거
                  thumbnailUrl = thumbnailUrl.replace(/["']/g, '');
                }
              }
              
              // 방법 2: data-src 속성에서 추출 (lazy loading 이미지)
              if (!thumbnailUrl) {
                const imgElement = thumbnailElement.querySelector('img');
                if (imgElement) {
                  thumbnailUrl = imgElement.getAttribute('data-src') || 
                                imgElement.getAttribute('src') || 
                                imgElement.getAttribute('data-original') || '';
                }
              }
              
              // 방법 3: 컴퓨티드 스타일에서 추출
              if (!thumbnailUrl && window.getComputedStyle) {
                const computedStyle = window.getComputedStyle(thumbnailElement);
                const computedBgImage = computedStyle.backgroundImage;
                if (computedBgImage && computedBgImage !== 'none') {
                  thumbnailUrl = computedBgImage.replace(/^url\(['"]?/, '').replace(/['"]?\)$/, '');
                }
              }
              
              // 방법 4: 비디오 ID에서 YouTube 썸네일 URL 생성
              if (!thumbnailUrl) {
                const videoLink = row.querySelector('.title__label')?.href;
                if (videoLink) {
                  const videoId = videoLink.split('?')[0].split('/').pop();
                  if (videoId) {
                    thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
                  }
                }
              }
              
              // 상대 경로인 경우 절대 경로로 변환
              if (thumbnailUrl.startsWith('//')) {
                thumbnailUrl = 'https:' + thumbnailUrl;
              }
            } catch (error) {
              console.error('썸네일 추출 오류:', error);
            }
          }
          
          // 제목
          const title = row.querySelector('.title__label h3')?.textContent.trim();
          
          // 태그
          const tags = [];
          row.querySelectorAll('.ttags__item').forEach(tag => {
            tags.push(tag.textContent.trim());
          });
          
          // 날짜
          const date = row.querySelector('.title__date')?.textContent.trim();
          
          // 조회수
          const views = row.querySelector('.score .fluc-label')?.textContent.trim();
          
          // 채널 정보
          const channelName = row.querySelector('.channel .name')?.textContent.trim();
          
          // 채널 이미지 추출 부분 강화
          const channelImageElement = row.querySelector('.channel .profile-image img');
          let channelImageUrl = '';
          if (channelImageElement) {
            channelImageUrl = channelImageElement.src || 
                             channelImageElement.getAttribute('data-src') || 
                             channelImageElement.getAttribute('data-original') || '';
          }
          
          const subscribers = row.querySelector('.channel .subs__count')?.textContent.trim();
          
          // 채널 ID 추출 (URL에서 추출)
          const channelLink = row.querySelector('.channel__wrapper')?.href || '';
          const channelId = channelLink.includes('channelId=') 
            ? channelLink.split('channelId=')[1]
            : (channelLink.split('/channel/')[1] || '');
          
          // 유튜브 채널 URL 생성
          const channelUrl = channelId ? `https://www.youtube.com/channel/${channelId}` : '';
          
          // 비디오 URL
          const videoId = row.querySelector('.title__label')?.href.split('?')[0].split('/').pop();
          const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
          
          // 채널 이미지가 없는 경우 채널 ID로 기본 이미지 생성
          if (!channelImageUrl && channelId) {
            channelImageUrl = `https://yt3.ggpht.com/ytc/${channelId}=s88-c-k-c0x00ffffff-no-rj`;
          }
          
          items.push({
            rank,
            fluctuation,
            fluctuationType,
            thumbnailUrl,
            title,
            tags,
            date,
            views,
            channelName,
            channelImageUrl,
            subscribers,
            channelUrl,
            videoUrl
          });
        } catch (error) {
          console.error('항목 파싱 오류:', error);
        }
      });
      
      return items;
    });
    
    return chartData;
  } catch (error) {
    console.error('크롤링 오류:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

// IPC 통신 설정
ipcMain.handle('scrape-chart', async (event, { videoType, country, period }) => {
  try {
    mainWindow.webContents.send('update-status', '크롤링 중...');
    const data = await scrapeYoutubeChart(videoType, country, period);
    return data;
  } catch (error) {
    console.error('크롤링 오류:', error);
    throw error;
  }
});

// 애플리케이션 종료 시 브라우저 정리
app.on('before-quit', async () => {
  if (globalBrowser) {
    await globalBrowser.close();
    globalBrowser = null;
  }
});