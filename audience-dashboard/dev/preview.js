// Builds dev/preview.html = Index.html + mock backend, for opening in a browser.
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'Index.html'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8');
fs.writeFileSync(path.join(__dirname, 'preview.html'), html.replace('</style>', '</style>\n<script>' + mock + '</script>'));
console.log('Wrote dev/preview.html');
