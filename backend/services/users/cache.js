import { supa } from "../../db.js";

async function getAllActiveUsers() {
  // Adapt these columns to your schema if needed
  const { data, error } = await supa
    .from("users")
    .select("id, email, first_name, last_name, li_daily_enabled, li_daily_quota")
    .eq("active", true);

  if (error) throw error;
  return data || [];
}

const globalUserCache = {
  _users: [],
  async refresh() {
    this._users = await getAllActiveUsers();
    return this._users;
  },
  list() {
    return this._users;
  }
};

export default globalUserCache;
export { getAllActiveUsers };
