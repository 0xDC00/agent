const trans = Object.create(null);
trans.send = function (s) {
  console.log('-------');
  console.log(s);
  clipboard.writeText(s);
}