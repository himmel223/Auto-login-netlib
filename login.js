const axios = require('axios');
const { chromium } = require('playwright');

// --- 配置常量 ---
const DELAY_MIN_MS = 8000;  // 账号间最小延迟 (8秒)
const DELAY_MAX_MS = 12000; // 账号间最大延迟 (12秒)

// --- 环境变量 ---
const token = process.env.BOT_TOKEN;
const chatId = process.env.CHAT_ID;
const accounts = process.env.ACCOUNTS;

// --- 辅助函数：生成随机延迟 ---
function randomDelay(minMs, maxMs) {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(resolve => setTimeout(resolve, delay));
}

if (!accounts) {
  console.log('❌ 未配置账号');
  process.exit(1);
}

// 解析多个账号，支持逗号或分号分隔
const accountList = accounts.split(/[,;]/).map(account => {
  const [user, pass] = account.split(":").map(s => s.trim());
  return { user, pass };
}).filter(acc => acc.user && acc.pass);

if (accountList.length === 0) {
  console.log('❌ 账号格式错误，应为 username1:password1,username2:password2');
  process.exit(1);
}

async function sendTelegram(message) {
  if (!token || !chatId) return;

  const now = new Date();
  // 调整时间为香港时间 (UTC+8)
  const hkTime = new Date(now.getTime() + (8 * 60 * 60 * 1000)); 
  const timeStr = hkTime.toISOString().replace('T', ' ').substr(0, 19) + " HKT";

  const fullMessage = `🎉 Netlib 登录通知\n\n登录时间：${timeStr}\n\n${message}`;

  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: fullMessage
    }, { timeout: 10000 });
    console.log('✅ Telegram 通知发送成功');
  } catch (e) {
    console.log('⚠️ Telegram 发送失败');
  }
}

async function loginWithAccount(user, pass) {
  console.log(`\n🚀 开始登录账号: ${user}`);
  
  const browser = await chromium.launch({ 
    headless: true,
    // 增加沙箱参数以提高兼容性
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] 
  });
  
  let page;
  let result = { user, success: false, message: '' };
  
  try {
    page = await browser.newPage();
    page.setDefaultTimeout(45000); // 增加默认超时时间到 45 秒
    
    console.log(`📱 ${user} - 正在访问网站...`);
    await page.goto('https://www.netlib.re/', { waitUntil: 'domcontentloaded' });
    
    // 随机等待 3-5 秒
    let delay = await randomDelay(3000, 5000); 
    console.log(`⏳ ${user} - 初始页面加载等待 ${delay / 1000} 秒...`);
    
    console.log(`🔑 ${user} - 点击登录按钮...`);
    // 使用更健壮的 Role 选择器
    await page.getByRole('link', { name: 'Login' }).click({ timeout: 10000 });
    
    // 随机等待 2-3 秒
    delay = await randomDelay(2000, 3000);
    console.log(`⏳ ${user} - 等待登录页加载 ${delay / 1000} 秒...`);
    await randomDelay(2000, 3000);
    
    console.log(`📝 ${user} - 填写用户名...`);
    // 使用更健壮的类型选择器
    await page.fill('input[name="username"], input[type="text"]', user);
    
    // 随机等待 1-2 秒
    await randomDelay(1000, 2000);
    
    console.log(`🔒 ${user} - 填写密码...`);
    await page.fill('input[name="password"], input[type="password"]', pass);
    
    // 随机等待 1-2 秒
    await randomDelay(1000, 2000);
    
    console.log(`📤 ${user} - 提交登录...`);
    // 使用更健壮的 Role 选择器
    await page.getByRole('button', { name: 'Validate' }).click();
    
    // 等待网络和页面状态稳定
    await page.waitForLoadState('networkidle'); 
    await page.waitForTimeout(5000); // 最后等待 5 秒确认页面跳转
    
    // 检查登录是否成功
    const pageContent = await page.content();
    
    // 根据网站内容判断是否成功，这里假设 'exclusive owner' 或用户名出现即成功
    if (pageContent.includes('exclusive owner') || pageContent.includes(user)) {
      console.log(`✅ ${user} - 登录成功`);
      result.success = true;
      result.message = `✅ ${user} 登录成功`;
    } else {
      console.log(`❌ ${user} - 登录失败 (页面未显示成功标识)`);
      result.message = `❌ ${user} 登录失败`;
    }
    
  } catch (e) {
    console.log(`❌ ${user} - 登录异常: ${e.message}`);
    result.message = `❌ ${user} 登录异常: ${e.message}`;
  } finally {
    if (page) await page.close();
    await browser.close();
  }
  
  return result;
}

async function main() {
  console.log(`🔍 发现 ${accountList.length} 个账号需要登录`);
  
  const results = [];
  
  for (let i = 0; i < accountList.length; i++) {
    const { user, pass } = accountList[i];
    console.log(`\n📋 处理第 ${i + 1}/${accountList.length} 个账号: ${user}`);
    
    const result = await loginWithAccount(user, pass);
    results.push(result);
    
    // 如果不是最后一个账号，进行随机延迟
    if (i < accountList.length - 1) {
      const delay = await randomDelay(DELAY_MIN_MS, DELAY_MAX_MS);
      console.log(`\n⏳ 模拟人工休息，等待 ${delay / 1000} 秒后处理下一个账号...`);
      // 使用随机延迟函数进行等待
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // 汇总所有结果并发送一条消息
  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;
  
  let summaryMessage = `📊 登录汇总: ${successCount}/${totalCount} 个账号成功\n\n`;
  
  results.forEach(result => {
    summaryMessage += `${result.message}\n`;
  });
  
  await sendTelegram(summaryMessage);
  
  console.log('\n✅ 所有账号处理完成！');
}

main().catch(console.error);
