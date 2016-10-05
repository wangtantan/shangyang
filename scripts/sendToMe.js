'use strict';

const async = require('async');
const _u = require('../common/util');
const logger = _u.logger;
const loggerD = _u.loggerD;
const AppErr = require('../common/AppErr');

const userService = _u.service('user');
const User = _u.model('User');
const weixin = require('../common/weixin');
const redisService = _u.service('redis');

const openIds = [
  "o0zx1s4KfSsw4yOo74g1o3P78DW4"
];



async.eachSeries(openIds, sendMsg, console.log);


function sendMsg(openId, cb) {
  let openId = openId;
  console.log('openId:', openId);
  // let rank = 70;
  _u.mySeries({
    createQrCode: (_cb) => {
      weixin.createForeverQrcode('FScene_0');
    }
    // sendMsg: (_cb) => {
    //   weixin.sendMsgToQualifiedInviter(openId, ret.rank, _cb);
    // },
  }, _u.delayRun(cb));
}

