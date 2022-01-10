document.addEventListener('DOMContentLoaded', function () {
  let currentTabId = false;

  const startBtn = document.querySelector('.start');
  const stopBtn = document.querySelector('.stop');
  const downCsvBtn = document.querySelector('.down-csv');
  const countDiv = document.querySelector('.count');

  startBtn.addEventListener('click', onStartClick, false);
  stopBtn.addEventListener('click', onStopClick, false);
  downCsvBtn.addEventListener('click', onDownCsvClick, false);

  function queryCurrentTab(callback) {
    chrome.tabs.query({ currentWindow: true, active: true }, function (tabs) {
      callback(tabs[0].id);
    })
  }

  queryCurrentTab((tabId) => {
    currentTabId = tabId;
    chrome.tabs.sendMessage(currentTabId, { msg: "connect", tabId });
  });

  function sendTabMessage(msg) {
    queryCurrentTab((tabId) => {
      chrome.tabs.sendMessage(tabId, { msg });
    });
  }

  function onStartClick() {
    sendTabMessage("start");
  }
  function onStopClick() {
    sendTabMessage("stop");
  }

  function onDownCsvClick() {
    sendTabMessage("down-csv");
  }

  document.querySelector(".clear-data").addEventListener("click", () => {
    sendTabMessage("clear-data");
  });

  function getTimeString(timeNumber) {
    if (timeNumber < 10) {
      return `0${timeNumber}`;
    } else {
      return timeNumber;
    }
  }

  function drawCountTime(request) {
    const {count, tabId} = request;
    if (currentTabId && tabId == currentTabId) {
      const hour = parseInt(count / 3600);
      const minute = parseInt((count % 3600) / 60);
      const second = parseInt(count - hour * 3600 - minute * 60);
      countDiv.innerHTML = `${getTimeString(hour)}:${getTimeString(minute)}:${getTimeString(second)}`;
    }
  }

  chrome.runtime.onMessage.addListener(
    function (request) {
      switch (request.msg) {
        case "count":
          drawCountTime(request);
          break;
      }
    }
  );
}, false);