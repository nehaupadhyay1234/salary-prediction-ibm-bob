const numberInput = document.querySelector('#experience-number');
const slider = document.querySelector('#experience-slider');
const salaryValue = document.querySelector('#salary-value');
const salaryCaption = document.querySelector('#salary-caption');
const monthlyValue = document.querySelector('#monthly-value');
const rSquared = document.querySelector('#r-squared');
const chart = document.querySelector('#salary-chart');
const chartFallback = document.querySelector('#chart-fallback');
const experienceRange = document.querySelector('#experience-range');
const sampleCount = document.querySelector('#sample-count');

let model;
let predictionTimer;
let requestId = 0;
let selectedExperience = 5;

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function formatExperience(value) {
  return `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 })} ${Number(value) === 1 ? 'year' : 'years'}`;
}

function setExperience(value, shouldPredict = true) {
  const experience = Number(value);
  if (!Number.isFinite(experience) || experience < 0 || experience > 40) return;

  selectedExperience = experience;
  numberInput.value = String(experience);
  if (experience <= 20) slider.value = String(experience);
  renderChart();
  if (shouldPredict) schedulePrediction(experience);
}

function schedulePrediction(experience) {
  window.clearTimeout(predictionTimer);
  predictionTimer = window.setTimeout(() => fetchPrediction(experience), 120);
}

async function fetchPrediction(experience) {
  const currentRequest = ++requestId;
  salaryCaption.classList.remove('is-warning');
  salaryCaption.textContent = 'Updating estimate…';

  try {
    const response = await fetch('/api/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ experience }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to calculate this estimate.');
    if (currentRequest !== requestId) return;

    salaryValue.textContent = currency.format(result.predictedSalary);
    monthlyValue.textContent = currency.format(result.predictedSalary / 12);
    if (experience < model.minExperience || experience > model.maxExperience) {
      salaryCaption.textContent = `Outside the ${formatExperience(model.minExperience)} to ${formatExperience(model.maxExperience)} training range.`;
      salaryCaption.classList.add('is-warning');
    } else {
      salaryCaption.textContent = `Based on ${formatExperience(experience)} of experience.`;
    }
  } catch (error) {
    if (currentRequest !== requestId) return;
    salaryCaption.textContent = error.message;
    salaryCaption.classList.add('is-warning');
  }
}

function drawChart() {
  if (!model || !chart) return;
  const bounds = chart.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;

  const pixelRatio = window.devicePixelRatio || 1;
  chart.width = Math.round(bounds.width * pixelRatio);
  chart.height = Math.round(bounds.height * pixelRatio);
  const context = chart.getContext('2d');
  context.scale(pixelRatio, pixelRatio);

  const width = bounds.width;
  const height = bounds.height;
  const padding = { top: 12, right: 12, bottom: 34, left: 58 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const xMaximum = Math.ceil(model.maxExperience / 5) * 5;
  const yMinimum = Math.floor(Math.min(...model.points.map((point) => point.salary)) / 20000) * 20000;
  const yMaximum = Math.ceil(Math.max(...model.points.map((point) => point.salary)) / 20000) * 20000;
  const x = (value) => padding.left + (value / xMaximum) * plotWidth;
  const y = (value) => padding.top + ((yMaximum - value) / (yMaximum - yMinimum)) * plotHeight;

  context.clearRect(0, 0, width, height);
  context.font = '10px Trebuchet MS, sans-serif';
  context.textBaseline = 'middle';

  // Grid lines + Y axis labels
  for (let index = 0; index <= 4; index += 1) {
    const salary = yMinimum + ((yMaximum - yMinimum) * index) / 4;
    const lineY = y(salary);
    context.beginPath();
    context.moveTo(padding.left, lineY);
    context.lineTo(width - padding.right, lineY);
    context.strokeStyle = '#e2e7df';
    context.lineWidth = 1;
    context.stroke();
    context.fillStyle = '#758074';
    context.textAlign = 'right';
    context.fillText(`$${Math.round(salary / 1000)}k`, padding.left - 10, lineY);
  }

  // X axis labels
  const xSteps = 3;
  for (let index = 0; index <= xSteps; index += 1) {
    const experience = (xMaximum * index) / xSteps;
    const pointX = x(experience);
    context.fillStyle = '#758074';
    context.textAlign = 'center';
    context.fillText(String(Math.round(experience)), pointX, height - 16);
  }

  // Regression line
  context.beginPath();
  context.moveTo(x(0), y(model.intercept));
  context.lineTo(x(model.maxExperience), y(model.intercept + model.slope * model.maxExperience));
  context.strokeStyle = '#225b45';
  context.lineWidth = 2.5;
  context.stroke();

  // Data points
  for (const point of model.points) {
    context.beginPath();
    context.arc(x(point.experience), y(point.salary), 4, 0, Math.PI * 2);
    context.fillStyle = '#e8774e';
    context.fill();
    context.strokeStyle = '#fff';
    context.lineWidth = 1.5;
    context.stroke();
  }

  // Selected experience dot
  if (selectedExperience >= 0 && selectedExperience <= model.maxExperience) {
    const predictedSalary = model.intercept + model.slope * selectedExperience;
    context.beginPath();
    context.arc(x(selectedExperience), y(predictedSalary), 6, 0, Math.PI * 2);
    context.fillStyle = '#bde76c';
    context.fill();
    context.strokeStyle = '#225b45';
    context.lineWidth = 2;
    context.stroke();
  }
}

function renderChart() {
  if (model) drawChart();
}

async function initialize() {
  try {
    const response = await fetch('/api/model');
    if (!response.ok) throw new Error('Model details could not be loaded.');
    model = await response.json();
    sampleCount.textContent = `${model.points.length} RECORDS`;
    rSquared.textContent = model.rSquared.toFixed(3);
    experienceRange.textContent = `TRAINING RANGE: ${formatExperience(model.minExperience).toUpperCase()}–${formatExperience(model.maxExperience).toUpperCase()}`;
    drawChart();
    fetchPrediction(selectedExperience);
  } catch {
    salaryCaption.textContent = 'Could not connect to the model. Restart the app and reload this page.';
    salaryCaption.classList.add('is-warning');
    chartFallback.hidden = false;
  }
}

numberInput.addEventListener('input', () => setExperience(numberInput.value));
slider.addEventListener('input', () => setExperience(slider.value));
document.querySelectorAll('[data-years]').forEach((button) => {
  button.addEventListener('click', () => setExperience(button.dataset.years));
});
window.addEventListener('resize', drawChart);
initialize();
