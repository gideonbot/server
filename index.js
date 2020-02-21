const express = require('express');
const app = express();

app.use(express.static('public'));

app.listen(80, "0.0.0.0", () => console.log('Gideon server listening on port 80!'));