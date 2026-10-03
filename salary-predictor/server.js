const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const port = Number(process.env.PORT || 3000);
const fileTypes = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
};

function loadTrainingData() {
  const contents = fs.readFileSync(path.join(__dirname, 'Salary.csv'), 'utf8');
  const [header, ...lines] = contents.trim().split(/\r?\n/);

  if (header.trim() !== 'YearsExperience,Salary') {
    throw new Error('Salary.csv must have YearsExperience,Salary columns.');
  }

  const points = lines.map((line) => {
    const [experience, salary] = line.split(',').map(Number);
    if (!Number.isFinite(experience) || !Number.isFinite(salary)) {
      throw new Error('Salary.csv contains a non-numeric or incomplete row.');
    }
    return { experience, salary };
  });

  if (points.length < 2) {
    throw new Error('Salary.csv must contain at least two data rows.');
  }

  return points;
}

function fitModel(points) {
  const averageExperience = points.reduce((sum, point) => sum + point.experience, 0) / points.length;
  const averageSalary = points.reduce((sum, point) => sum + point.salary, 0) / points.length;
  const variance = points.reduce((sum, point) => sum + (point.experience - averageExperience) ** 2, 0);
  const covariance = points.reduce((sum, point) => (
    sum + (point.experience - averageExperience) * (point.salary - averageSalary)
  ), 0);
  const slope = covariance / variance;
  const intercept = averageSalary - slope * averageExperience;
  const totalVariation = points.reduce((sum, point) => sum + (point.salary - averageSalary) ** 2, 0);
  const residualVariation = points.reduce((sum, point) => (
    sum + (point.salary - (intercept + slope * point.experience)) ** 2
  ), 0);

  return {
    points,
    slope,
    intercept,
    rSquared: 1 - residualVariation / totalVariation,
    minExperience: Math.min(...points.map((point) => point.experience)),
    maxExperience: Math.max(...points.map((point) => point.experience)),
  };
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1024) {
      throw new Error('Request body is too large.');
    }
  }
  return JSON.parse(body);
}

const model = fitModel(loadTrainingData());

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'GET' && requestUrl.pathname === '/api/model') {
    sendJson(response, 200, model);
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/predict') {
    try {
      const payload = await readJson(request);
      const experience = payload.experience;
      if (typeof experience !== 'number' || !Number.isFinite(experience) || experience < 0 || experience > 40) {
        sendJson(response, 400, { error: 'Enter experience between 0 and 40 years.' });
        return;
      }
      sendJson(response, 200, { predictedSalary: model.intercept + model.slope * experience });
    } catch {
      sendJson(response, 400, { error: 'A valid JSON prediction request is required.' });
    }
    return;
  }

  const asset = request.method === 'GET' ? fileTypes[requestUrl.pathname] : undefined;
  if (asset) {
    const [fileName, contentType] = asset;
    response.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(path.join(__dirname, fileName)).pipe(response);
    return;
  }

  sendJson(response, 404, { error: 'Not found.' });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Salary estimator ready at http://127.0.0.1:${port}`);
});
