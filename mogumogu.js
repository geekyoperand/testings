const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const moment = require('moment-timezone');
 
// Log file
const logFile = path.join(__dirname, `responses_${new Date().getTime()}.log`);
 
// Delay helper
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
 
// Common headers
const headers = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'keep-alive',
  'Content-Type': 'application/json',
  'Origin': 'https://www.mogumogu.com',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...',
  'sec-ch-ua': '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
};
 
const logStep = (email, step, status, message) => {
  const logEntry = `${step.toUpperCase()} | ${email} | ${status} | ${message}\n`;
  fs.appendFileSync(logFile, logEntry);
  console.log(logEntry.trim());
};
 
const registerUser = async (user) => {
  const userData = {
    name: user.name,
    birthday: user.birthday,
    gender: user.gender,
    phone: user.phone,
    email: user.email,
    password: 'Test@1234',
    consent_analytics_marketing: true,
  };
 
  try {
    const res = await axios.post('https://api.mogumogu.com/user/register', userData, { headers });
    logStep(user.email, 'register', 'SUCCESS', JSON.stringify(res.data));
    return true;
  } catch (err) {
    const data = err.response?.data || {};
    if (data.message === 'email already exists.') {
      logStep(user.email, 'register', 'EXISTS', JSON.stringify(data));
      return true;
    } else {
      logStep(user.email, 'register', 'FAILURE', JSON.stringify(data));
      return false;
    }
  }
};
 
const loginUser = async (email, maxRetries = 3) => {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const res = await axios.post('https://api.mogumogu.com/auth/login', {
        email,
        password: 'Test@1234'
      }, { headers });
 
      logStep(email, 'login', 'SUCCESS', JSON.stringify(res.data));
      return res.data.access_token;
    } catch (err) {
      const message = err.response?.data || err.message;
      const raw = typeof message === 'string' && message.includes('503');
 
      if (raw || err?.response?.status === 503) {
        logStep(email, 'login', 'RETRY', `503 error, attempt ${attempt + 1}`);
        attempt++;
        await delay(2000); // wait before retrying
      } else {
        logStep(email, 'login', 'FAILURE', JSON.stringify(message));
        return null;
      }
    }
  }
 
  logStep(email, 'login', 'FAILURE', `503 repeated, max retries reached`);
  return null;
};
 
 
const updateAddress = async (user, token, maxRetries = 3) => {
  const addressPayload = {
    number: user.phone,
    alley: user.name,
    street: user.street,
    postcode: user.postcode,
    state: user.state,
    city: user.city,
    country: "India"
  };
 
  const cookieHeader = `_ga=GA1.1.1296927404.1747170814; _qoreId=...; access_token=${token}; refresh_token=...`;
 
  const addressHeaders = {
    ...headers,
    Cookie: cookieHeader
  };
 
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      // const res = await axios.put(
      //   'https://api.mogumogu.com/user/address',
      //   addressPayload,
      //   { headers: addressHeaders }
      // );
      // logStep(user.email, 'address_update', 'SUCCESS', JSON.stringify(res.data));
      await performSpin(user.email, addressPayload.number, addressPayload, cookieHeader);
      return;
    } catch (err) {
      const message = err.response?.data || err.message;
      const raw = typeof message === 'string' && message.includes('503');
 
      if (raw || err?.response?.status === 503) {
        logStep(user.email, 'address_update', 'RETRY', `503 error, attempt ${attempt + 1}`);
        attempt++;
        await delay(2000); // wait before retrying
      } else {
        logStep(user.email, 'address_update', 'FAILURE', JSON.stringify(message));
        return;
      }
    }
  }
 
  logStep(user.email, 'address_update', 'FAILURE', '503 repeated, max retries reached');
};
 
const performSpin = async (email, name, address, cookieHeader) => {
  try {
    // Step 1: Get Turnstile token task_id
    const startRes = await axios.get('https://131e-2401-4900-1c72-3409-6086-20f-2de5-cc4e.ngrok-free.app/turnstile?url=https%3A%2F%2Fwww.mogumogu.com%2Fspin-wheel%2Fplay&sitekey=0x4AAAAAABdJseUK3fpyoPL2');
    const taskId = startRes.data.task_id;
    logStep(email, 'captcha_task', 'STARTED', `Task ID: ${taskId}`);
    // Step 2: Poll /result
    let tokenResponse;
    for (let i = 237; i < 10000; i++) {
      await delay(1000);
      const resultRes = await axios.get(`https://131e-2401-4900-1c72-3409-6086-20f-2de5-cc4e.ngrok-free.app/result?id=${taskId}`);
      if (resultRes.data?.value) {
        tokenResponse = resultRes.data.value;
        break;
      }
    }
 
    if (!tokenResponse) {
      logStep(email, 'captcha_task', 'FAILURE', 'Token not received in time');
      return;
    }
 
    logStep(email, 'captcha_task', 'SUCCESS', 'Captcha token received');
 
    // Step 3: Call spin-the-wheel
    const spinPayload = {
      customerName: name,
      customerEmail: email,
      customerAddress: address,
      countryCode: "IN",
      token: tokenResponse
    };
 
    const spinRes = await axios.post(
      'https://api.mogumogu.com/cms/api/game-spin-the-wheel',
      spinPayload,
      {
        headers: {
          ...headers,
          Cookie: cookieHeader,
          Origin: 'https://www.mogumogu.com',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-site'
        }
      }
    );
 
    logStep(email, 'spin_wheel', 'SUCCESS', JSON.stringify(spinRes.data));
  } catch (err) {
    logStep(email, 'spin_wheel', 'FAILURE', JSON.stringify(err.response?.data || err.message));
  }
};
const cities = [
  { city: "Mumbai", state: "Maharashtra", postcode: "400001" },
  { city: "Delhi", state: "Delhi", postcode: "110001" },
  { city: "Bangalore", state: "Karnataka", postcode: "560001" },
  { city: "Hyderabad", state: "Telangana", postcode: "500001" },
  { city: "Ahmedabad", state: "Gujarat", postcode: "380001" },
  { city: "Chennai", state: "Tamil Nadu", postcode: "600001" },
  { city: "Kolkata", state: "West Bengal", postcode: "700001" },
  { city: "Pune", state: "Maharashtra", postcode: "411001" },
  { city: "Jaipur", state: "Rajasthan", postcode: "302001" },
  { city: "Mohali", state: "Punjab", postcode: "140010" },
];

const genders = ["male", "female"];

const firstNames = [
  'Amit', 'Neha', 'Rahul', 'Priya', 'Ravi', 'Simran', 'Ankit', 'Tina',
  'Andeep', 'Anesh', 'Anha', 'Anhul', 'Anjay', 'Anket', 'Anlak', 'Anleen',
  'Anlesh', 'Anmil', 'Anmit', 'Nitin', 'Deepa', 'Sahil', 'Karan', 'Meena',
  'Vikas', 'Reena', 'Manish', 'Pooja', 'Aditya', 'Sneha', 'Tanvi', 'Arjun',
  'Ishita', 'Raj', 'Kavya', 'Abhinav', 'Isha', 'Harsh', 'Divya', 'Mohit',
  'Avni', 'Yash', 'Aarav', 'Anaya', 'Ira', 'Veer', 'Devansh', 'Riya',
  'Anirudh', 'Diya', 'Parth', 'Mira', 'Atharv', 'Keya', 'Vedant', 'Myra',
  'Naman', 'Lavanya', 'Shivam', 'Aanya', 'Aryan', 'Saanvi', 'Kritika', 'Om',
  'Anvi', 'Manav', 'Chirag', 'Natasha', 'Rohit', 'Kriti', 'Varun', 'Payal',
  'Jay', 'Trisha', 'Tushar', 'Sanya', 'Rachit', 'Khushi', 'Siddharth', 'Zara',
  'Uday', 'Ahana', 'Harshit', 'Aarohi', 'Ishan', 'Tara', 'Kabir', 'Niharika',
  'Reyansh', 'Aadhya', 'Arnav', 'Kiara', 'Laksh', 'Avika', 'Vivaan', 'Ameesha',
  'Samar', 'Ankita', 'Rudra', 'Charvi', 'Ritesh', 'Mehul', 'Bhavya', 'Reyanshi',
  'Gaurav', 'Palak', 'Kush', 'Aalia', 'Anaya', 'Nikhil', 'Rhea', 'Ayaan',
  'Ishaan', 'Tanisha', 'Dhruv', 'Meher', 'Kiaan', 'Shruti', 'Neeraj', 'Muskan',
  'Raghav', 'Avyaan', 'Prisha', 'Atharva', 'Kunal', 'Vansh', 'Shrishti', 'Zain',
  'Advait', 'Ishleen', 'Arya', 'Samarveer', 'Mahika', 'Anushka', 'Hrithik',
  'Pranav', 'Mahi', 'Aadit', 'Anvi', 'Sanaya', 'Dev', 'Amaira', 'Shaan',
  'Aradhya', 'Yuvraj', 'Ansh', 'Krisha', 'Kartik', 'Inaya', 'Tejas', 'Suhana',
  'Hardik', 'Inaaya', 'Krish', 'Aanya', 'Darsh', 'Ritvik', 'Aarush', 'Anya',
  'Rehan', 'Pranavi', 'Raunak', 'Saloni', 'Vivan', 'Tanish', 'Harleen', 'Moksh',
  'Aryaveer', 'Vridhi', 'Iraansh', 'Divyansh', 'Shaurya', 'Kritin', 'Niyati',
  'Ayansh', 'Mysha', 'Ritisha', 'Ashvik', 'Aarit', 'Ishani', 'Aarit', 'Nysa',
  'Dhriti', 'Avi', 'Pratyush', 'Lavleen', 'Ahaan', 'Shanaya', 'Reyanshvi',
  'Tvesa', 'Siddhi', 'Anvit', 'Yug', 'Ruhi', 'Devika', 'Shaista', 'Jiya',
  'Tanishka', 'Eshan', 'Veera', 'Ruhani', 'Zoya', 'Tanay', 'Anshul', 'Namya'
];
const lastNames = [
  'Sharma', 'Verma', 'Kumar', 'Singh', 'Patel', 'Mehta', 'Gupta', 'Joshi',
  'Rideep', 'Riesh', 'Riha', 'Rihul', 'Rijay', 'Riket', 'Rikit', 'Rilak',
  'Rileen', 'Rilesh', 'Rimit', 'Malhotra', 'Chopra', 'Kapoor', 'Thakur',
  'Mishra', 'Agarwal', 'Das', 'Bose', 'Dey', 'Menon', 'Nair', 'Pillai',
  'Banerjee', 'Chatterjee', 'Mukherjee', 'Saxena', 'Srivastava', 'Tiwari',
  'Yadav', 'Tripathi', 'Bhattacharya', 'Ganguly', 'Rastogi', 'Pandey', 'Dubey',
  'Ghosh', 'Sengupta', 'Khatri', 'Mahajan', 'Bajpai', 'Kaushik', 'Rawat',
  'Chandel', 'Lal', 'Aggarwal', 'Rana', 'Bhandari', 'Gaur', 'Bansal', 'Talwar',
  'Sodhi', 'Jindal', 'Grover', 'Bagga', 'Suri', 'Mathur', 'Juneja', 'Duggal',
  'Cheema', 'Dhillon', 'Chadha', 'Gill', 'Sehgal', 'Kalra', 'Sethi', 'Arora',
  'Ahluwalia', 'Wadhwa', 'Oberoi', 'Makhija', 'Sachdev', 'Nagpal', 'Kapila',
  'Bindra', 'Taneja', 'Saluja', 'Vohra', 'Batra', 'Khanna', 'Luthra', 'Puri',
  'Bajaj', 'Kohli', 'Rajput', 'Malik', 'Ranaut', 'Kansal', 'Talreja', 'Bedi',
  'Kundra', 'Sidhu', 'Nanda', 'Mathpal', 'Bhalla', 'Grover', 'Narula', 'Sareen',
  'Monga', 'Narang', 'Sibal', 'Bagri', 'Chhibber', 'Ahuja', 'Mendiratta',
  'Katyal', 'Walia', 'Sehrawat', 'Manchanda', 'Chugh', 'Bharadwaj', 'Upadhyay',
  'Lakra', 'Bisht', 'Negi', 'Rawal', 'Garg', 'Grewal', 'Sodhani', 'Gulati',
  'Sangwan', 'Bhati', 'Bansod', 'Kamble', 'More', 'Deshmukh', 'Gaikwad', 'Salunkhe',
  'Naik', 'Shetty', 'Sawant', 'Jadhav', 'Patil', 'Kadam', 'Dumbre', 'Babar',
  'Parab', 'Thorat', 'Wankhede', 'Kamble', 'Josalkar', 'Phadke', 'Gokhale',
  'Apte', 'Kelkar', 'Barve', 'Shinde', 'Yelve', 'Joglekar', 'Ketkar', 'Dalvi',
  'Bhave', 'Ranade', 'Deshpande', 'Gadge', 'Bhide', 'Kulkarni', 'Phatak', 'Bhonsle',
  'Gadge', 'Kale', 'Agashe', 'Pendse', 'Baraskar', 'Zope', 'Deokar', 'Inamdar',
  'Dhore', 'Tamhane', 'Rane', 'Waze', 'Soman', 'Joshiwar', 'Karnik', 'Bhagat',
  'Pagare', 'Haldankar', 'Nikam', 'Jiwane', 'Salvi', 'Dumbre', 'Mujumdar', 'Baviskar',
  'Tambe', 'Lonkar', 'Desai', 'Palande', 'Shirke', 'Mhatre', 'Sawarkar', 'Tike'
];

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomBirthday(startYear = 1980, endYear = 2005) {
  const start = new Date(`${startYear}-01-01`).getTime();
  const end = new Date(`${endYear}-12-31`).getTime();
  return new Date(start + Math.random() * (end - start))
    .toISOString()
    .split("T")[0];
}

function getRandomPhone() {
  return `79${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`;
}

// function generateRandomUser() {
//   const firstName = getRandomItem(firstNames);
//   const lastName = getRandomItem(lastNames);
//   const fullName = `${firstName} ${lastName}`;
//   const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@thetempmail.online`;
//   const phone = getRandomPhone();
//   const gender = getRandomItem(genders);
//   const birthday = getRandomBirthday();
//   const location = getRandomItem(cities);

//   return {
//     name: fullName,
//     email,
//     phone,
//     gender,
//     birthday,
//     street: location.city,
//     city: location.city,
//     state: location.state,
//     postcode: location.postcode
//   };
// }

function generateRandomUser() {
  const firstName = getRandomItem(firstNames);
  const lastName = getRandomItem(lastNames);
  const randomNumber = Math.floor(1000 + Math.random() * 9000); // 4-digit random number
  const fullName = `${firstName} ${lastName}`;
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randomNumber}@thetempmail.online`;
  const phone = getRandomPhone();
  const gender = getRandomItem(genders);
  const birthday = getRandomBirthday();
  const location = getRandomItem(cities);

  return {
    name: fullName,
    email,
    phone,
    gender,
    birthday,
    street: location.city,
    city: location.city,
    state: location.state,
    postcode: location.postcode
  };
}


// Example usage:
const processUser = async (user) => {
  const email = user.email;
  const name = user.name;
  const phone = user.phone;
 
  let attempts = 0;
  let registered = false;
 
  // Try registration up to 3 times if unknown error
  while (attempts < 10 && !registered) {
    registered = await registerUser(user);
    if (!registered) {
      attempts++;
      await delay(1000);
    }
  }
 
  if (!registered) {
    logStep(email, 'process', 'SKIPPED', 'Could not register user after retries');
    return;
  }
 
  // Login
  const token = await loginUser(email);
  if (!token) return;
 
  // Address update
  await updateAddress(user, token);
};
 function generateRandomUser() {
  const firstName = getRandomItem(firstNames);
  const lastName = getRandomItem(lastNames);
  const randomNumber = Math.floor(1000 + Math.random() * 9000);
  const fullName = `${firstName} ${lastName}`;
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randomNumber}@thetempmail.online`;
  const phone = getRandomPhone();
  const gender = getRandomItem(genders);
  const birthday = getRandomBirthday();
  const location = getRandomItem(cities);

  return {
    name: fullName,
    email,
    phone,
    gender,
    birthday,
    street: location.city,
    city: location.city,
    state: location.state,
    postcode: location.postcode,
  };
}

function generateMultipleUsers(count = 5) {
  return Array.from({ length: count }, () => generateRandomUser());
}
const runBatch = async () => {
  const users =   generateMultipleUsers(1000)
  for (let i = 0; i <= 1000; i++) {
    await processUser(users[i]);
    await delay(200); // increase if rate-limited
  }
};
  
// cron.schedule('29 5 * * *', () => {
//   const now  = moment().tz('Asia/Kolkata');
//   console.log(`Running batch at ${now.format()}`)
  runBatch();
// }, {
//   timezone: 'Asia/Kolkata'
// })
