module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/text');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end('{"version":1,"pspId":"4BE8DFE7C705DD585139674DF649F2B7DF89B44591CC26245B848EB2586E087B","createdOn":1786546082458}');
};
