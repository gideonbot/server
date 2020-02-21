const express = require('express');
const serveIndex = require('serve-index');
const app = express();

app.get('/', (req, res) => {
    res.send('Gideon server online!');
});

app.use('/web', express.static('public'))
app.use('/web', serveIndex('public'))

app.listen(3000, () => console.log('Gideon server listening on port 3000!'));