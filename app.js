const { Spot } = require('@binance/connector'); // api Binance
const client = new Spot(apiKey, apiSecret); // Доступ к учётной записи на Binance
const axios = require('axios'); // для фиксирования значений в GoogleSheets.
const qs = require('qs'); // для фиксирования значений в GoogleSheets. Код в Apps Script в конце документа
const moment = require('moment/moment'); // Удобное взаимодействие с датой и временем
moment.locale('ru'); // устанавливаем Российский формат времени
const apiKey = 'YOUR API KEY'; // Ваш ключ api Binance
const apiSecret = 'YOUR API KEY'; // Ваш секретный ключ api Binance

let isNextOperationBuy = false; // какая след. операция
const UPWARD_TREND_THRESHOLD = 0.9; // процентная величина разницы между суммой продажи и покупки при положительном тренде
const DIP_THRESHOLD = -1.25; // процентная величина разницы между суммой продажи и покупки
const PROFIT_THRESHOLD = 1.25; // процентная величина разницы между суммой покупки и продажи
const STOP_LOSS_THRESHOLD = -2; // процентная величина между разницей покупки и продажи при отрицательном тренеде
const myLimitBuy = 70; // процентная величина доли депозита на который проиходит покупка актива
let currentTokenBalance = 0; // текущий баланс актива
let currentUsdtBalance = 0; // текущий баланс депозита
let currentPrice = 0; // текущая стоимость актива
let lastOpPrice = 0.3696; // стоимость актива на момент покупки/продажи
let percentageDiff = 0; // процентная разница между стоимостью актива на момент покупки/продажи и текущей стоимостью актива

// Ниже в качестве актива используется Bitcoin

const attemptToMakeTrade = () => {
  // функция покупки актива
  const tryToBuy = (percentageDiff, config) => {
    if (
      percentageDiff >= UPWARD_TREND_THRESHOLD ||
      percentageDiff <= DIP_THRESHOLD
    ) {
      client
        .newOrder('BTCUSDT', 'BUY', 'MARKET', {
          quantity: Math.floor(
            ((currentUsdtBalance / 100) * myLimitBuy) / currentPrice
          ),
        })
        .then((response) => {
          client.logger.log(response.data);
          lastOpPrice = currentPrice;
          isNextOperationBuy = false;
        })
        .then(() => {
          // фиксация данных в Google Sheets
          axios
            .request(config)
            .then((response) => {
              console.log(JSON.stringify(response.data));
            })
            .catch((error) => {
              console.log(error);
            });
        })
        .catch((error) => console.log(error));
    }
  };

  const tryToSell = (percentageDiff, config) => {
    // функция продажи актива
    if (
      percentageDiff >= PROFIT_THRESHOLD ||
      percentageDiff <= STOP_LOSS_THRESHOLD
    ) {
      client
        .newOrder('BTCUSDT', 'SELL', 'MARKET', {
          quantity: Math.floor(currentTokenBalance),
        })
        .then((response) => {
          client.logger.log(response.data);
          lastOpPrice = currentPrice;
          isNextOperationBuy = true;
        })
        .then(() => {
          // фиксация данных в Google Sheets
          axios
            .request(config)
            .then((response) => {
              console.log(JSON.stringify(response.data));
            })
            .catch((error) => {
              console.log(error);
            });
        })
        .catch((error) => console.log(error));
    }
  };

  client
    .coinInfo()
    .then((response) => {
      currentTokenBalance = Number(
        response.data.filter((el) => el.coin == 'BTC')[0].free
      );

      currentUsdtBalance = Number(
        response.data.filter((el) => el.coin == 'USDT')[0].free
      );
    })
    .then(() =>
      client
        .bookTicker('BTCUSDT')
        .then((response) => {
          currentPrice = Number(response.data.bidPrice);
          percentageDiff = ((currentPrice - lastOpPrice) / lastOpPrice) * 100;
          setTimeout(attemptToMakeTrade, 30000); // Зацикливание функции. Соответсвтенно все запросы производятся раз в 30 сек.
          let date = moment().format('LLL');
          let data = qs.stringify({
            date: `${date}`,
            usdtBalance: `${currentUsdtBalance.toFixed(2)}`,
            tokenBalance: `${currentTokenBalance}`,
            tokenPrice: `${currentPrice}`,
            lastPrice: `${lastOpPrice}`,
            difference: `${percentageDiff.toFixed(2)}`,
            nextOp: `${isNextOperationBuy ? 'SELL' : 'BUY'}`,
          });
          let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'Your Google Sheets Link', // Ссылка на ваш проект в Google Sheets
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Cookie:
                '__Host-GAPS=1:bkYCC5mIH0XVJTiiq3YlL8JxKUXDWA:wuekE1s4glt4oICe',
            },
            data: data,
          };
          let onlineCheck = config;
          onlineCheck.data = qs.stringify({
            onlineCheck: `${date}`,
          });
          axios
            .request(onlineCheck)
            .then((response) => {
              console.log(JSON.stringify(response.data));
            })
            .catch((error) => {
              console.log(error);
            });
          if (isNextOperationBuy) {
            tryToBuy(percentageDiff, config);
          } else {
            tryToSell(percentageDiff, config);
          }
        })

        .catch((error) => console.log(error))
    )
    .catch((error) => console.log(error));
};
attemptToMakeTrade();

/*
Код в Apps Script Google Sheets

function doPost(request) {
 const sheet = SpreadsheetApp.getActiveSheet() // получаем таблицу
 const {date,usdtBalance, tokenBalance, tokenPrice, lastPrice, difference,nextOp,onlineCheck} = request.parameter // получаем все параменты из запроса
 const lastRow = sheet.getLastRow() + 1 // получаем последнию строчку
 sheet.getRange(`A${lastRow}`).setValue(date) // записываем переданные данные в конкретной ячейке
 sheet.getRange(`B${lastRow}`).setValue(usdtBalance)
 sheet.getRange(`C${lastRow}`).setValue(tokenBalance)
 sheet.getRange(`D${lastRow}`).setValue(tokenPrice)
 sheet.getRange(`E${lastRow}`).setValue(lastPrice)
 sheet.getRange(`F${lastRow}`).setValue(difference)
 sheet.getRange(`G${lastRow}`).setValue(nextOp)
 sheet.getRange(`H${2}`).setValue(onlineCheck)

return ContentService.createTextOutput('All data has been send') // выводим в консоль сообщение
}
function doGet(request) {}


*/
