'use strict';

const fs = require('fs');
const request = require('request');
const moment = require('moment');
const sprintf = require("sprintf-js").sprintf;

const constants = require('./constants')

const ImageComposer = require('./ImageComposer/')
const _u = require('./util')
const redisService = _u.service('redis');

const loggerD = _u.loggerD;
const logger = _u.logger;

const cache = require('./cache');

const APPID     = process.env.APPID;
const APPSECRET = process.env.APPSECRET;

const API_BASE = 'https://api.weixin.qq.com/cgi-bin';
const MP_BASE = 'https://mp.weixin.qq.com/cgi-bin';
const tokenUrl = `${API_BASE}/token`;
const createQrcodeUrl = `${API_BASE}/qrcode/create`;
const showQrcodeUrl = `${MP_BASE}/showqrcode`;
// 新增临时素材
const uploadMediaUrl = `${API_BASE}/media/upload`;

// const addMaterialUrl = `${API_BASE}/material/add_material`;
const userInfoUrl = `${API_BASE}/user/info`;
const templateMsgSendUrl = `${API_BASE}/message/template/send`;

// const templateId = 'EMU7DdpXcA-msQkLLwp2R1oZINryZi-uJ9XwpDjvHkI';
const defaultTemplateId = 'eLHxc-wK89kjyc2rHDHXCnrPECB4XNqCBJ5q7PU3ytM';

function invokeWithToken(myFunc) {
  return function() {
    let args = Array.prototype.slice.call(arguments, 0);
    let cb = args.pop();

    _u.mySeries({
      token: (_cb) => {
        getAccessToken(_cb);
      },
      result: (_cb, ret) => {
        console.log(ret.token);
        args.unshift(ret.token);
        args.push(_cb);
        myFunc.apply(null, args);
      },
    }, (err, ret) => {
      cb(err, ret.result);
    });
  };
}

// POST https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=ACCESS_TOKEN
// 文档 http://mp.weixin.qq.com/wiki/7/12a5a320ae96fecdf0e15cb06123de9f.html
//调用时不用传递token参数，因为invokeWithToken实现了这部分的内部逻辑
function sendCustomerMsg(token, msgBody, cb) {
  let url = `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${token}`;
  request.post({url, json: true, body: msgBody}, (err, response, resBody) => {
    if (err) return _cb(err);
    cb(null, resBody);
  });
}
exports.sendCustomerMsg = invokeWithToken(sendCustomerMsg);
const sendCustomerMsgWithToken = invokeWithToken(sendCustomerMsg);
exports.sendCustomerMsgWithToken = invokeWithToken(sendCustomerMsg);
//weixin.sendCustomerMsg(msgBody, console.log);

// GET https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=APPID&secret=APPSECRET
function getAccessToken(cb) {
  let qs = {grant_type: 'client_credential', appid: APPID, secret: APPSECRET};
  cache.get('weixinAccessToken', (_cb) => {
    console.log('[get weixin access token]:');
    request.get({url: tokenUrl, qs, json: true}, (err, response, resBody) => {
      if (err) return _cb(err);
      console.log(resBody.access_token);
      _cb(null, resBody.access_token);
    });
  }, cb);
}
exports.getAccessToken = getAccessToken;

// GET https://api.weixin.qq.com/cgi-bin/user/info?access_token=ACCESS_TOKEN&openid=OPENID&lang=zh_CN
function getUserInfo(token, openid, cb) {
  let qs = {access_token: token, openid, lang: 'zh_CN'};
  request.get({url: userInfoUrl, qs, json: true}, (err, response, resBody) => {
    logger.error('userInfo', resBody);
    if (err) return cb(err);
    if (resBody.errcode) {
      return cb(null, {});
    }
    cb(null, resBody);
  });
}
exports.getUserInfo = invokeWithToken(getUserInfo);

// POST https://api.weixin.qq.com/cgi-bin/qrcode/create?access_token=TOKEN
function createQrcode(accessToken, incrId, cb) {
  let options = {
    url: createQrcodeUrl, qs: {access_token: accessToken}, json: true,
    body: {
      action_name: 'QR_SCENE', expire_seconds: 2592000,
      action_info: {scene: {scene_id: incrId}},
    },
  };
  logger.error('qrcode', options.body.action_info);

  request.post(options, (err, response, resBody) => {
    if (err) return cb(err);
    cb(null, resBody);//{"ticket":"xxxx","url":"yyyy"}
  });
}
exports.createQrcode = createQrcode;

// POST https://api.weixin.qq.com/cgi-bin/qrcode/create?access_token=TOKEN
// {"action_name": "QR_LIMIT_STR_SCENE", "action_info": {"scene": {"scene_str": "123"}}}
function createForeverQrcode(accessToken, sceneStr, cb) {
  console.log(sceneStr)
  let options = {
    url: createQrcodeUrl, qs: {access_token: accessToken}, json: true,
    body: {
      action_name: 'QR_LIMIT_STR_SCENE',
      action_info: {scene: {scene_str: sceneStr}},
    },
  };
  loggerD.write('[Create Forever QRCode', options.body.action_info);

  request.post(options, (err, response, resBody) => {
    if (err) return cb(err);
    console.log(resBody)
    cb(null, resBody);//{"ticket":"xxxx","url":"yyyy"}
  });
}
exports.createForeverQrcode = invokeWithToken(createForeverQrcode);

// GET https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=TICKET
function showQrcode(ticket, openid, cb) {
  let url = `${showQrcodeUrl}?ticket=${encodeURIComponent(ticket)}`;
  let imageSrc = `./static/${openid}.png`;
  let stream = request(url)
    .on('error', (err) => {
      cb(err);
    })
    .pipe(fs.createWriteStream(imageSrc))
    .on('error', (err) => {
      cb(err);
    });

  loggerD.write('[Download Media] Download QRCode Image:', '[Path]', imageSrc);
  stream.on('finish', () => {
    console.log(`finish download: ${imageSrc}`);
    cb(null, imageSrc);
  });
}
exports.showQrcode = showQrcode;

// POST https://api.weixin.qq.com/cgi-bin/media/upload?access_token=ACCESS_TOKEN&type=TYPE
function uploadImg(token, imgPath, cb) {
  let options = {
    url: uploadMediaUrl, qs: {access_token: token, type: 'image'}, json: true,
    formData: { media: fs.createReadStream(imgPath) },
  };

  loggerD.write('[Upload Media] Upload Image:', '[Path]', imgPath);
  request.post(options, (err, response, resBody) => {
    if (err) return cb(err);
    cb(null, resBody);//{"media_id":"xxxx","type":"yyyy","created_at":"zzz"}
  });
}
exports.uploadImg = uploadImg;
const uploadImgWithToken = invokeWithToken(uploadImg);

function getHeadImg(url, openid, cb) {
  console.log(url);
  let imageSrc = `./static/head_${openid}.png`;
  let stream = request(url)
    .on('error', (err) => {
      cb(err);
    })
    .pipe(fs.createWriteStream(imageSrc))
    .on('error', (err) => {
      cb(err);
    });

  loggerD.write('[Download Media] Download Head Image:', '[Path]', imageSrc);
  stream.on('finish', () => {
    console.log(`finish download: ${imageSrc}`);
    cb(null, imageSrc);
  });
}

function processQualifiedInviter(inviter, cb) {
  _u.mySeries({
    rank: (_cb) => {
      redisService.getNextQualifiedRank(_cb);
    },
    addQualifiedInviterToRank: (_cb, ret) => {
      redisService.addQualifiedInviterToRank(inviter, ret.rank, _cb);
    },
    sendMsg: (_cb, ret) => {
      sendMsgToQualifiedInviter(inviter, ret.rank, _cb);
    },
  }, cb);
}

function sendMsgToQualifiedInviter(openid, rank, cb) {
  loggerD.write('sendMsgToQualifiedInviter', 'openid', openid, 'rank', rank);
  // let term = Math.ceil(rank / 100);
  // let group = Math.ceil((rank % 100) / 10);
  let term = 2;
  _u.mySeries({
    sendText: (_cb, ret) => {
      let msgBody = {
        touser: openid, msgtype: "text",
        text: { content: sprintf(constants.msgMap[term], rank) }
      };
      sendCustomerMsgWithToken(msgBody, _cb);
    },
    // sendQrCode: (_cb, ret) => {
    //   if (term > 2) return _cb();
    //   sendImage(openid, `./groupQrCode/term2.jpg`, _cb);
    // },
  }, cb);
}

exports.sendMsgToQualifiedInviter = sendMsgToQualifiedInviter;

function sendImage(openid, imgPath, cb) {
  loggerD.write('sendImage', 'openid', openid, 'imgPath', imgPath);
  _u.mySeries({
    upload: (_cb, ret) => {
      uploadImgWithToken(imgPath, _cb);
    },
    sendQrCode: (_cb, ret) => {
      let msgBody = {
        touser: openid, msgtype: "image",
        image: { media_id: ret.upload.media_id }
      };
      sendCustomerMsgWithToken(msgBody, _cb);
    },
  }, cb);
}
exports.sendImage = sendImage;

function processInviterWithEnoughScore(inviter, cb) {
  _u.mySeries({
    rank: (_cb) => {//查看这个邀请者是否已经有排名了
      redisService.getQualifiedRank(inviter, _cb);
    },
    processRank: (_cb, ret) => {
      if (ret.rank) return _cb();//如果已经有排名了，就不需要再处理了
      processQualifiedInviter(inviter, _cb);//如果没有排名，那处理这个达标用户
    },
  }, cb);
}

exports.sendGroupQrcode = (inviter, threshold, cb) => {
  _u.mySeries({
    score: (_cb) => {
      redisService.getInviterScore(inviter, _cb);
    },
    processScore: (_cb, ret) => {
      if (ret.score < threshold) return _cb();//如果分数不够，直接离开
      processInviterWithEnoughScore(inviter, _cb);
    },
  }, cb);
};

function generateQrCodeForOneUser(token, user, cb) {
  let openid = user.openid;
  let threshold = user.threshold;//abtest的阈值
  let incrId = user.incrId;
  _u.mySeries({
    qrcode: (_cb, ret) => {
      createQrcode(token, incrId, _cb);
    },
    qrcodePngPath: (_cb, ret) => {
      showQrcode(ret.qrcode.ticket, openid, _cb);
    },
    getHeadImg: (_cb, ret) => {
      console.log(user);
      if (!user.info.headimgurl) return _cb();
      getHeadImg(user.info.headimgurl, openid, _cb);
    },
    composePath: (_cb, ret) => {
      console.log(ret.qrcodePngPath);
      console.log(ret.getHeadImg);
      const imgComposer = new ImageComposer();
      imgComposer.compose({
        qrcodeSrc: ret.qrcodePngPath,
        portraitSrc: ret.getHeadImg,
        outputPath: `./static/output_${openid}.png`
      }, _cb);
    },
    upload: (_cb, ret) => {
      uploadImg(token, ret.composePath, _cb);
    },
  }, (err, ret) => {
    if (err) return cb(err);
    cb(null, {
      ticket: ret.qrcode.ticket,
      mediaId: ret.upload.media_id,
    });
  });
}
exports.generateQrCodeForOneUser = invokeWithToken(generateQrCodeForOneUser);

//POST https://api.weixin.qq.com/cgi-bin/menu/create?access_token=ACCESS_TOKEN
function createMenu(token, menu, cb) {
  let url = `${API_BASE}/menu/create?access_token=${token}`;
  request.post({url, json: true, body: menu}, (err, response, resBody) => {
    if (err) return _cb(err);
    cb(null, resBody);
  });
}
const createMenuWithToken = invokeWithToken(createMenu);
exports.createMenuWithToken = createMenuWithToken;

//POST: https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=ACCESS_TOKEN
function sendTemplateMessage(accessToken, openid, data, opt, cb) {
  console.log(opt)
  let templateId = opt && opt.templateId;
  let url = opt && opt.url;
  let options = {
    url: templateMsgSendUrl, qs: {access_token: accessToken}, json: true,
    body: {
      touser: openid,
      template_id: templateId ? templateId : defaultTemplateId,
      url: url ? url : '',
      data: data
    },
  };
  request.post(options, (err, response, resBody) => {
    if (err) return cb(err);
    cb();
  });
}
exports.sendTemplateMessage = sendTemplateMessage;
exports.sendTemplateMessageWithToken = invokeWithToken(sendTemplateMessage);


function sendScoreMessage(openid, inviteeid, inviterUser, cb) {
  _u.mySeries({
    token: (_cb) => {
      getAccessToken(_cb);
    },
    userInfo: (_cb, ret) => {
      getUserInfo(ret.token, openid, _cb);
    },
    invitee: (_cb, ret) => {
      getUserInfo(ret.token, inviteeid, _cb);
    },
    inviterScore: (_cb, ret) => {//邀请者的得分
      redisService.getInviterScore(openid, _cb);
    },
    template: (_cb, ret) => {

      moment.locale('zh-cn');
// console.log(moment().format('YYYY年M月Do hh时mm分'))

      sendTemplateMessage(ret.token, openid, {


        // name: {
        //   // value: ret.userInfo.nickname + '邀请' + ret.invitee.nickname,
        //   value: '邀请' + ret.invitee.nickname,
        //   color: '#173177'
        // },
        // score: {
        //   value: ret.inviterScore,
        //   color: '#173177'
        // },

        // {{first.DATA}}
        // 姓名：{{keyword1.DATA}}
        // 时间：{{keyword2.DATA}}
        // {{remark.DATA}}
        first: {
          value: '你有' + ret.inviterScore + '位好友扫码加入，你当前的影响力为' + ret.inviterScore,
          color: ''
        },
        keyword1: {
          value: ret.invitee.nickname,
          color: ''
        },
        keyword2: {
          value: moment().format('YYYY年M月Do hh时mm分'),
          color: ''
        },

        remark: {
          value: '影响力积累到' + inviterUser.threshold + '即可免费抱团学习', // threshold
          color: ''
        }
      }, {}, _cb);
      loggerD.write('[Send Message] Score Template:', '[To]', openid,
        '[Invitee]', inviteeid, '[Score]', ret.inviterScore);
    }
  }, (err, ret) => {
    if (err) return cb(err);
    cb();
  });
}
exports.sendScoreMessage = sendScoreMessage;
