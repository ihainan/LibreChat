const util = require('util');
const axios = require('axios');
const passport = require('passport');
const { logger } = require('@librechat/data-schemas');
const socialLogin = require('./socialLogin');
const { updateUserKey } = require('~/models');

const DINGTALK_TOKEN_URL = 'https://api.dingtalk.com/v1.0/oauth2/userAccessToken';
const DINGTALK_USER_URL = 'https://api.dingtalk.com/v1.0/contact/users/me';
const DINGTALK_AUTH_URL = 'https://login.dingtalk.com/oauth2/auth';

function DingTalkStrategy(options, verify) {
  this.name = 'dingtalk';
  this._clientId = options.clientId;
  this._clientSecret = options.clientSecret;
  this._callbackURL = options.callbackURL;
  this._verify = verify;
  passport.Strategy.call(this);
}

util.inherits(DingTalkStrategy, passport.Strategy);

DingTalkStrategy.prototype.authenticate = function (req) {
  const self = this;
  const authCode = req.query.authCode;
  logger.info(`[DingTalk] authenticate called, hasAuthCode=${!!authCode}`);

  if (!authCode) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: self._clientId,
      redirect_uri: self._callbackURL,
      scope: 'openid',
      prompt: 'consent',
    });
    return self.redirect(`${DINGTALK_AUTH_URL}?${params.toString()}`);
  }

  (async () => {
    try {
      const tokenRes = await axios.post(
        DINGTALK_TOKEN_URL,
        {
          clientId: self._clientId,
          clientSecret: self._clientSecret,
          code: authCode,
          grantType: 'authorization_code',
        },
        { headers: { 'Content-Type': 'application/json' } },
      );

      const accessToken = tokenRes.data?.accessToken;
      if (!accessToken) {
        return self.error(new Error('DingTalk token exchange failed: no accessToken'));
      }

      const userRes = await axios.get(DINGTALK_USER_URL, {
        headers: { 'x-acs-dingtalk-access-token': accessToken },
      });

      const userInfo = userRes.data;
      const profile = {
        id: userInfo.unionId,
        displayName: userInfo.nick,
        emails: [{ value: userInfo.email || `${userInfo.unionId}@dingtalk.local` }],
        photos: userInfo.avatarUrl ? [{ value: userInfo.avatarUrl }] : [],
        _raw: userInfo,
        _json: userInfo,
      };

      const verified = async (err, user) => {
        if (err) return self.error(err);
        if (!user) return self.fail({ message: 'Authentication failed' });

        try {
          const userId = user._id?.toString() ?? user.id;
          await provisionNewApiToken(userInfo.unionId, userId, userInfo);
        } catch (provisionErr) {
          logger.warn('[DingTalk] provision token failed (non-fatal):', provisionErr.message);
        }

        return self.success(user);
      };

      self._verify(accessToken, null, null, profile, verified);
    } catch (err) {
      const status = err?.response?.status;
      logger.error('[DingTalk] authenticate error:', err.message, 'status:', status);
      if (status === 400 || status === 401) {
        return self.fail({ message: `DingTalk auth failed (${status}): ${err.message}` });
      }
      return self.error(err);
    }
  })();
};

async function provisionNewApiToken(dingtalkUnionId, librechatUserId, userInfo) {
  const baseUrl = process.env.NEW_API_BASE_URL;
  const adminToken = process.env.NEW_API_ADMIN_ACCESS_TOKEN;
  const adminUserId = process.env.NEW_API_ADMIN_USER_ID;

  if (!baseUrl || !adminToken || !adminUserId) {
    logger.warn('[DingTalk] NEW_API_BASE_URL / NEW_API_ADMIN_ACCESS_TOKEN / NEW_API_ADMIN_USER_ID not set — skipping provision');
    return;
  }

  const body = {
    dingtalk_id: dingtalkUnionId,
    username: userInfo?.nick || userInfo?.unionId,
    display_name: userInfo?.nick || '',
    email: userInfo?.email || '',
  };

  const res = await axios.post(
    `${baseUrl}/api/user/provision_token`,
    body,
    {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'New-Api-User': adminUserId,
        'Content-Type': 'application/json',
      },
    },
  );

  const tokenKey = res.data?.data?.token_key;
  if (!tokenKey) {
    throw new Error(`provision_token returned no token_key: ${JSON.stringify(res.data)}`);
  }

  await updateUserKey({
    userId: librechatUserId,
    name: 'new-api',
    value: JSON.stringify({ apiKey: tokenKey }),
    expiresAt: new Date('9999-12-31'),
  });

  logger.info(`[DingTalk] provisioned new-api token for user ${librechatUserId}`);
}

const getProfileDetails = ({ profile }) => ({
  email: profile.emails[0].value,
  id: profile.id,
  avatarUrl: profile.photos[0]?.value,
  username: profile.displayName,
  name: profile.displayName,
  emailVerified: false,
});

const dingtalkLoginVerify = socialLogin('dingtalk', getProfileDetails);

const dingtalkStrategy = () =>
  new DingTalkStrategy(
    {
      clientId: process.env.DINGTALK_CLIENT_ID,
      clientSecret: process.env.DINGTALK_CLIENT_SECRET,
      callbackURL: `${process.env.DOMAIN_SERVER}/oauth/dingtalk`,
    },
    dingtalkLoginVerify,
  );

module.exports = dingtalkStrategy;
