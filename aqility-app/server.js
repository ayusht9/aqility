import http from 'node:http';
import {readFile} from 'node:fs/promises';
const files={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/engine.js':['engine.js','text/javascript'],'/style.css':['style.css','text/css']};
http.createServer(async(req,res)=>{const entry=files[new URL(req.url,'http://localhost').pathname];if(!entry){res.writeHead(404);res.end('Not found');return;}try{const body=await readFile(new URL('./dist/'+entry[0],import.meta.url));res.writeHead(200,{'Content-Type':entry[1]+'; charset=utf-8','X-Content-Type-Options':'nosniff'});res.end(body);}catch{res.writeHead(500);res.end('Unable to read application file');}}).listen(5173,'127.0.0.1',()=>console.log('Aqility: http://localhost:5173'));
