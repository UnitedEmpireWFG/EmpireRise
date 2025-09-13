const banned = ["wfg","experior","gfi","global financial group","primerica","ig wealth","sun life advisor","manulife advisor","desjardins advisor","edward jones advisor"];
export const safe = {
  exclude(l) {
    const role = (l.role || "").toLowerCase();
    const bio = (l.bio || "").toLowerCase();
    const employer = (l.employer || "").toLowerCase();
    return banned.some(b => role.includes(b) || bio.includes(b) || employer.includes(b));
  }
};

