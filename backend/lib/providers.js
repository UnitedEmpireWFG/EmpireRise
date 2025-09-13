export const providers = {
  linkedin: {
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: ["r_liteprofile","r_emailaddress","w_member_social","offline_access"],
    clientId: () => process.env.LINKEDIN_CLIENT_ID,
    clientSecret: () => process.env.LINKEDIN_CLIENT_SECRET,
    redirectUri: () => process.env.LINKEDIN_REDIRECT_URI,
    makeAuthParams(state) {
      return {
        response_type: "code",
        client_id: this.clientId(),
        redirect_uri: this.redirectUri(),
        scope: this.scopes.join(" "),
        state
      }
    },
    makeTokenBody(code) {
      return new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: this.redirectUri(),
        client_id: this.clientId(),
        client_secret: this.clientSecret()
      })
    },
    parseToken: json => ({
      access_token: json.access_token,
      refresh_token: json.refresh_token || null,
      expires_in: json.expires_in || null
    })
  },
  meta: {
    authUrl: "https://www.facebook.com/v19.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
    scopes: [
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "pages_manage_metadata",
      "instagram_basic",
      "instagram_manage_insights",
      "instagram_content_publish"
    ],
    clientId: () => process.env.FB_APP_ID,
    clientSecret: () => process.env.FB_APP_SECRET,
    redirectUri: () => process.env.FB_REDIRECT_URI,
    makeAuthParams(state) {
      return {
        client_id: this.clientId(),
        redirect_uri: this.redirectUri(),
        response_type: "code",
        scope: this.scopes.join(","),
        state
      }
    },
    makeTokenBody(code) {
      const u = new URL(this.tokenUrl)
      u.searchParams.set("client_id", this.clientId())
      u.searchParams.set("client_secret", this.clientSecret())
      u.searchParams.set("redirect_uri", this.redirectUri())
      u.searchParams.set("code", code)
      return { url: u.toString(), form: null }
    },
    parseToken: json => ({
      access_token: json.access_token,
      refresh_token: null,
      expires_in: json.expires_in || null
    }),
    async exchangeLongLived(shortToken) {
      const u = new URL("https://graph.facebook.com/v19.0/oauth/access_token")
      u.searchParams.set("grant_type", "fb_exchange_token")
      u.searchParams.set("client_id", this.clientId())
      u.searchParams.set("client_secret", this.clientSecret())
      u.searchParams.set("fb_exchange_token", shortToken)
      const r = await fetch(u.toString())
      return r.json()
    }
  }
}

