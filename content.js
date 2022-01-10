
let mainPane = null;
let stochPane = null;
let intervalId = false;
let countTime = 0;
let currentTabId = false;

class IndexedDbDAO {
  constructor(name, version, upgradeCb, doneCb) {
    this.name = name;
    this.version;
    console.log("init", name, version);
    const openReq = indexedDB.open(name, version);
    openReq.onsuccess = function (e) {
      const db = e.target.result;
      // Chrome 23 still has setVersion so don't upgrade
      // unless the version is still old.
      if ('setVersion' in db && db.version < version) {
        const setVerReq = db.setVersion(version);
        setVerReq.onsuccess = function (e) {
          upgradeCb(e.target.result.db);
          doneCb();
        };
      } else {
        doneCb();
      }
    };
    openReq.onupgradeneeded = function (e) {
      // Never gets raised before Chrome 23.
      upgradeCb(e.target.result);
    };
    openReq.onerror = function (e) {
      console.log('init error');
    };
    openReq.onblocked = function (e) {
      console.log('init blocked');
    }
  }

  transaction(mode, table, processCb, doneCb) {
    const openReq = indexedDB.open(this.name);
    openReq.onsuccess = function (e) {
      const db = e.target.result;
      const transaction = db.transaction([table], mode);
      transaction.oncomplete = function (e) {
        if (doneCb) {
          doneCb();
        }
      };
      transaction.onabort = function (e) {
        console.log('transaction abort');
      };
      transaction.onerror = function (e) {
        console.log('transaction error');
      };
      processCb(transaction);
    };
    openReq.onerror = function (e) {
      console.log('open transaction error');
    };
  };

  forEach(table, forEachCb, doneCb) {
    const process = (transaction) => {
      const cursor = transaction.objectStore(table).openCursor();
      cursor.onsuccess = function (e) {
        if (e.target.result) {
          forEachCb(e.target.result.value);
          e.target.result.continue();
        }
      };
      cursor.onerror = function (e) {
        console.log('cursor error');
      };
    }
    this.transaction('readonly', table, process, doneCb);
  }

  actionToAllRows(tableName, processCb, doneCb) {
    const process = (transaction) => {
      const requestAll = transaction.objectStore(tableName).getAll();
      requestAll.onsuccess = function (e) {
        processCb(event.target.result)
        if (doneCb) {
          doneCb();
        }
      };
      requestAll.onabort = function (e) {
        console.log('requestAll abort');
      };
      requestAll.onerror = function (e) {
        console.log('requestAll error');
      };
    }
    this.transaction('readonly', tableName, process, doneCb);
  }

  insert(table, data, doneCb) {
    const process = (transaction) => {
      transaction.objectStore(table).put(data);
    }
    return this.transaction('readwrite', table, process, doneCb);
  }

  clearTable(tableName, doneCb) {
    const process = (transaction) => {
      const table = transaction.objectStore(tableName);
      const request = table.clear();
      request.onsuccess = () => {
        if (doneCb) {
          doneCb();
        }
      }
    }
    return this.transaction('readwrite', tableName, process, doneCb);
  }

  delete(doneCb) {
    const delReq = indexedDB.deleteDatabase(this.name);
    delReq.onsuccess = function (e) {
      // Not triggered before Chrome 23.
      doneCb();
    };
    delReq.onerror = function (e) {
      console.log('delete error');
    };
    delReq.onblocked = function (e) {
      console.log('delete blocked');
    };
  }
};

function getPanes() {
  const chartSpot = document.querySelector("#chart_spot-tradingview");
  const _iframe = chartSpot.querySelector("iframe");
  const _document = _iframe.contentDocument || _iframe.contentWindow.document;
  const allPanes = _document.querySelectorAll(".chart-markup-table.pane");
  allPanes.forEach(pane => {
    const titleElements = pane.querySelectorAll(".apply-overflow-tooltip");
    titleElements.forEach(element => {
      const innerHTML = element.innerHTML;
      if (innerHTML.includes("Binance")) {
        mainPane = pane;
      } else if (innerHTML.includes("Stoch")) {
        stochPane = pane;
      }
    });
  });
}

function getClosePrice() {
  const titleElement = document.querySelector(".childrenContainer h1");
  const priceElement = document.querySelector(".showPrice");

  let direction = "up";
  if (priceElement.style.color == "rgb(246, 70, 93)") {
    direction = "down";
  }

  return {
    title: titleElement.innerHTML,
    direction,
    price: priceElement.innerHTML
  }
}

function getType() {
  const typeElement = mainPane.querySelectorAll(".apply-overflow-tooltip")[1];
  return {type: typeElement.innerHTML};
}

function getKDValue() {
  const valuePanes = stochPane.getElementsByClassName("valueValue-3kA0oJs5"); 
  const kElement = valuePanes[0];
  const dElement = valuePanes[1];
  return {
    k: kElement.innerHTML,
    d: dElement.innerHTML
  }
}

function sendBinanceData(data) {
  const request = {
    msg: "binance",
    data
  };
  console.log("send", request);
  chrome.runtime.sendMessage(request);
}

function checkNotiPermission() {
  if (Notification.permission != "granted") {
    Notification.requestPermission();
  }
}

const dbName = "BinanceDB";
const stochTbl = "Stochatic";

const dbDA0 = new IndexedDbDAO(dbName, 1, function (db) {
  db.createObjectStore(stochTbl, {
    autoIncrement: true
  });
}, function () {
  console.log('ready');
});

let delayTimeout = false;
function throttleHandleData(data) {
  if (delayTimeout) {
    return;
  } else {
    console.log("handle", data);
    dbDA0.insert(stochTbl, {
      time: new Date().getTime(),
      ...data,
    });
    if (Notification.permission == "granted") {
      const noti = new Notification(`${data.title} - ${data.type} - ${data.direction} - ${data.price}`, {
        body: `${data.title} - ${data.type} - ${data.direction} - ${data.price}\n%K: ${data.k} - %D: ${data.d}`,
      });
      delayTimeout = setTimeout(() => {
        delayTimeout = false;
      }, 60000);
    }
  }
}

function sendCountTime(count) {
  const request = {
    msg: "count",
    count,
    tabId: currentTabId
  };
  chrome.runtime.sendMessage(request);
}

function endGetDataInternal() {
  clearInterval(intervalId);
  console.log("end", intervalId);
  intervalId = false;
  countTime = 0;
}

function startGetDataInternal() {
  console.log("start");
  let check = false;
  intervalId = setInterval(() => {
    try {
      const closePrice = getClosePrice();
      const kdValue = getKDValue();
      const typeData = getType();
      const data = {...typeData, ...closePrice, ...kdValue};
      const kValue = parseFloat(data.k);
      const dValue = parseFloat(data.d);
      const currentCheck = (kValue - dValue) < 0;
      console.log("demo 1", currentCheck, check);
      if (countTime > 0 && currentCheck != check) {
        console.log("demo 2", kValue, dValue);
        throttleHandleData(data);
      }
      check = currentCheck
      sendCountTime(countTime++);
    } catch (error) {
      endGetDataInternal();
      console.log("error", error);
    }
  }, 1000);
} 

function connectToCurrentTab(request) {
  if (!currentTabId) {
    currentTabId = request.tabId;
    console.log("connecting", currentTabId);
  } else {
    console.log("connected", currentTabId);
  }
}

function downloadCSV() {
  dbDA0.actionToAllRows(stochTbl, (allRows) => {
    const dbValueArray = allRows.reverse().map((row, index) => {
      const timeString = new Date(row.time).toLocaleString("en-GB", { timeZone: "Asia/Ho_Chi_Minh" });
      return [index, row.title, row.type, `'${row.k}`, `'${row.d}`, row.direction, row.price.replace(",", ""), timeString.replace(",", " ")];
    });

    let csvContent = `data:text/csv;charset=utf-8,id,title,type,k,d,direction,price,time\n${dbValueArray.map(e => e.join(",")).join("\n")}`;
    const encodedUri = encodeURI(csvContent);
    const downTag = document.createElement("a");
    downTag.href = encodedUri;
    downTag.click();
  });
}

function clearData() {
  dbDA0.clearTable(stochTbl, () => {
    console.log("clear table");
  });
}

// run function
checkNotiPermission();

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  switch(request.msg) {
    case "start":
      try {
        getPanes();
        startGetDataInternal();
      } catch (error) {
        console.log("error", error);
      }
      break;
    case "connect": 
      connectToCurrentTab(request);
      break;
    case "down-csv":
      downloadCSV();
      break;
    case "clear-data":
      clearData();
      break;
    default:
      endGetDataInternal();
      break;
  }
});
