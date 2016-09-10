'use strict';

const _ = require('lodash');
const moment = require('moment');
const _u = require('../common/util');
const loggerD = _u.loggerD;
const logger = _u.logger;

const weixin = require('../common/weixin');

const User = _u.model('User');
const Invitation = _u.model('Invitation');
const redisService = _u.service('redis');


exports.processInvitation = (inviter, openid, cb) => {
  _u.mySeries({
    invitation: (_cb) => {
      Invitation.create({inviter, invitee: openid}, _cb);
    },
    saveToRedis: (_cb, ret) => {
      redisService.saddInvitee(inviter, openid, _cb);
    },
    // 发送积分变动消息（模板消息）给当其邀请者
    score: (_cb, ret) => {
      weixin.sendScoreMessage(inviter, openid, _cb);
    },
  }, cb);
};

exports.processSubscribe = (openid, cb) => {
  _u.mySeries({
    existedUser: (_cb) => {
      User.findOne({openid}, _cb);
    },
    user: (_cb, ret) => {
      if (ret.existedUser) {
        return _cb(null, ret.existedUser.toObject());
      }
      loggerD.write('createUser', openid);
      User.create({openid}, (err, user) => {
        if (err) return _cb(err);
        user = user.toObject();
        user.isNewCreated = true;//标识新用户
        _cb(null, user);
      });
    },
    // 生成课程介绍以及报名方式
    welcome: (_cb, ret) => {
      sendWelcomMsg(openid, _cb);
    },
    mediaId: (_cb, ret) => {
      //如果已经生成过二维码，无需重新生成，直接返回      
      updateMediaIdForUser(openid, _cb);
    },
    // 发送积分变动消息（模板消息）给当前用户
    // score: (_cb, ret) => {
    //   setTimeout(function() {
    //     weixin.sendScoreMessage(openid, openid);
    //   }, 2000);
    //   _cb();
    // }
  }, (err, ret) => {
    ret.user.mediaId = ret.mediaId
    cb(err, ret.user);
  });
};

function updateMediaIdForUser(openid, cb) {
  _u.mySeries({
    weixin: (_cb) => {
      weixin.generateQrCodeForOneUser(openid, _cb);
    },
    update: (_cb, ret) => {//返回更新后的doc
      User.update({openid}, ret.weixin, _cb);
    },
  }, (err, ret) => {
    if (err) return cb(err);
    cb(null, ret.weixin.mediaId);
  });
}
exports.updateMediaIdForUser = updateMediaIdForUser;

function sendWelcomMsg(openid, cb) {
   _u.mySeries({
    newsMsg: (_cb) => {
      weixin.sendCustomerMsg({
        touser: openid,
        msgtype: 'news',
        news: {
          articles: [{
            title: '课程介绍',
            description: '课程介绍的描述',
            url: 'http://mp.weixin.qq.com/s?__biz=MzAwODE4Nzk2Ng==&tempkey=DtfGz%2F5m1gHUHll6Qr7RvUoW%2BqLgSnD3IVVSgY1vNfRRZl0VBBYfetjFaw1KqBzyWjJ60fgk9U0YL%2BM2rzfcR%2F%2BjhBgmTqoWcpcjzjf2%2FHOhnirfqr4d%2B%2FMeG%2BMwwVmlz8oJvnyk1WY83sI1gYHv2g%3D%3D&#rd',
            picurl: 'http://mmbiz.qpic.cn/mmbiz/hb0fNLLZtnNSzqJelT9KgPnybh1LFCClicyzYxEIER6fCllSq8ZZevkL1cUKpTqoVD9MbeEDdKe2c5z7ceshG9g/640?wx_fmt=jpeg&tp=webp&wxfrom=5'
          }, {
            title: '我是另一个课程的介绍',
            description: '我是另一个课程介绍的描述',
            url: 'http://mp.weixin.qq.com/s?__biz=MzAwODE4Nzk2Ng==&tempkey=DtfGz%2F5m1gHUHll6Qr7RvUoW%2BqLgSnD3IVVSgY1vNfRRZl0VBBYfetjFaw1KqBzyWjJ60fgk9U0YL%2BM2rzfcR%2F%2BjhBgmTqoWcpcjzjf2%2FHOhnirfqr4d%2B%2FMeG%2BMwwVmlz8oJvnyk1WY83sI1gYHv2g%3D%3D&#rd',
            picurl: 'http://mmbiz.qpic.cn/mmbiz/hb0fNLLZtnNSzqJelT9KgPnybh1LFCClicyzYxEIER6fCllSq8ZZevkL1cUKpTqoVD9MbeEDdKe2c5z7ceshG9g/640?wx_fmt=jpeg&tp=webp&wxfrom=5'
          }]
        }
      }, _cb);
    },
    textMsg: (_cb, ret) => {
      weixin.sendCustomerMsg({
        touser: openid,
        msgtype: 'text',
        text: {
          content: '报名规则：<a href="http://baidu.com">点我查看详细的报名规则</a>'
        }
      }, _cb);    
    },
  }, (err, ret) => {
    if (err) return cb(err);
    cb();
  }); 
}
exports.sendWelcomMsg = sendWelcomMsg;



