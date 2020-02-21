const express = require('express');
const app = express();

app.use(express.static('public'));

app.listen(8080, "0.0.0.0", () => console.log('Gideon server listening on port 8080!'));