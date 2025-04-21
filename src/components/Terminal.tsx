import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { Terminal as XTerm } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  toggleTheme: () => void;
}

// 定義支持的語言
type Language = 'zh_TW' | 'en_US';

// 定義多語言文本資源
interface TextResources {
  [key: string]: {
    [key: string]: string;
  };
}

interface CommandResult {
  type: 'error' | 'success' | 'info' | 'warning' | 'system';
  content: string | React.ReactNode;
}

interface CursorProps {
  position: number;
}

const TerminalWrapper = styled.div`
  width: 100%;
  height: 100%;
  overflow: auto;
  padding: 16px;
  font-family: 'Fira Code', monospace;
  color: ${props => props.theme.foreground};
  background-color: ${props => props.theme.background};
`;

const TerminalOutput = styled.div`
  margin-bottom: 16px;
  max-height: calc(100% - 40px);
  overflow-y: auto;
  scroll-behavior: smooth;
  
  /* 自定義滾動條樣式 */
  &::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  
  &::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 4px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: rgba(100, 100, 100, 0.5);
    border-radius: 4px;
  }
  
  &::-webkit-scrollbar-thumb:hover {
    background: rgba(100, 100, 100, 0.7);
  }
`;

const CommandPrompt = styled.div`
  display: flex;
  align-items: center;
  margin: 4px 0;
`;

const Prompt = styled.span`
  color: ${props => props.theme.promptColor};
  margin-right: 8px;
`;

const InputWrapper = styled.div`
  position: relative;
  display: flex;
  flex: 1;
  min-width: 10px; /* 確保始終有寬度 */
`;

const Input = styled.input`
  width: 100%;
  background: transparent;
  border: none;
  color: ${props => props.theme.foreground};
  font-family: 'Fira Code', monospace;
  font-size: 16px;
  outline: none;
  caret-color: transparent; /* 隱藏默認光標 */
  letter-spacing: normal; /* 確保字符間距與顯示一致 */
  
  &:focus {
    outline: none;
  }
`;

const Cursor = styled.div<CursorProps>`
  position: absolute;
  background-color: ${props => props.theme.foreground};
  width: 12px;
  height: 20px;
  top: 50%;
  transform: translateY(-50%);
  left: ${props => `${props.position}ch`};
  opacity: 0.7;
`;

const SystemMessage = styled.p`
  color: ${props => props.theme.systemColor};
  margin: 4px 0;
  font-style: italic;
`;

const ErrorMessage = styled.p`
  color: ${props => props.theme.error};
  margin: 4px 0;
  &::before {
    content: "[錯誤] ";
    font-weight: bold;
  }
`;

const SuccessMessage = styled.p`
  color: ${props => props.theme.success};
  margin: 4px 0;
`;

const InfoMessage = styled.p`
  color: ${props => props.theme.info};
  margin: 4px 0;
`;

const WarningMessage = styled.p`
  color: ${props => props.theme.warning};
  margin: 4px 0;
  &::before {
    content: "[警告] ";
    font-weight: bold;
  }
`;

const ResultLine = styled.div`
  margin: 4px 0;
  color: ${props => props.theme.resultColor};
`;

const HighlightedText = styled.span`
  color: ${props => props.theme.highlightColor};
  font-weight: bold;
`;

const CommandHistory = styled.div`
  display: flex;
  flex-direction: column;
`;

const FileText = styled.span`
  color: ${props => props.theme.fileColor};
`;

const DirectoryText = styled.span`
  color: ${props => props.theme.directoryColor};
`;

// 定義 Rick Roll 相關的樣式
const RickRollContainer = styled.div`
  font-family: monospace;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.9);
  padding: 20px;
  z-index: 1000;
  overflow: auto;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`;

const RickRollVideo = styled.div`
  width: 100%;
  max-width: 800px;
  aspect-ratio: 16 / 9;
  display: flex;
  justify-content: center;
  align-items: center;
  
  iframe {
    width: 100%;
    height: 100%;
    border: 5px solid #ff3333;
    border-radius: 8px;
    box-shadow: 0 0 20px #ff0000;
  }
`;

const RickRollArt = styled(SystemMessage)`
  color: #ff3333;
  font-size: 16px;
  margin: 0;
  padding: 0;
  white-space: pre;
`;

const RickRollLyric = styled(SystemMessage)`
  color: #ffff33;
  margin: 5px 0;
  padding: 0;
`;

// 定義檔案系統的類型
interface FileItem {
  type: 'file';
  content: string[];
  contentEn?: string[]; // 英文內容
  permissions: string; // 如 "rw-r--r--"
  owner: string;
  group: string;
  lastModified: Date;
}

interface DirectoryItem {
  type: 'directory';
  content: Record<string, FileSystemItem>;
  permissions: string; // 如 "rwxr-xr-x"
  owner: string;
  group: string;
  lastModified: Date;
}

type FileSystemItem = FileItem | DirectoryItem;

interface FileSystem {
  [key: string]: FileSystemItem;
}

// 啟動序列消息
const bootMessages = [
  { msg: { 'zh_TW': '正在初始化系統核心 [v1.0.0]...', 'en_US': 'Initializing system kernel [v1.0.0]...' }, delay: 50 },
  { msg: { 'zh_TW': '載入核心模組... [OK]', 'en_US': 'Loading kernel modules... [OK]' }, delay: 30 },
  { msg: { 'zh_TW': '檢查系統依賴關係... [OK]', 'en_US': 'Checking system dependencies... [OK]' }, delay: 30 },
  { msg: { 'zh_TW': '載入使用者設定檔 [deviser]... [OK]', 'en_US': 'Loading user profile [deviser]... [OK]' }, delay: 30 },
  { msg: { 'zh_TW': '系統已就緒! 啟動完成。', 'en_US': 'System ready! Boot complete.' }, delay: 30 },
];

const Terminal: React.FC<TerminalProps> = ({ toggleTheme }) => {
  // 狀態定義
  const [input, setInput] = useState('');
  const [language, setLanguage] = useState<Language>('zh_TW');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [outputHistory, setOutputHistory] = useState<{command: string, result: CommandResult[]}[]>([]);
  const [userName, setUserName] = useState<string>('user');
  const [hostName, setHostName] = useState<string>('terminal');
  const [currentDirectory, setCurrentDirectory] = useState<string>('~');
  const [cursorPosition, setCursorPosition] = useState<number>(0);
  const [isBooting, setIsBooting] = useState<boolean>(false); // 禁用啟動動畫
  const [bootStage, setBootStage] = useState<number>(bootMessages.length); // 直接設置為完成
  const [isRickRolling, setIsRickRolling] = useState<boolean>(false);
  const [isRoot, setIsRoot] = useState<boolean>(false); // 是否為管理員權限
  const [groups, setGroups] = useState<string[]>(['users']); // 用戶所屬群組
  const [passwordAttempts, setPasswordAttempts] = useState<number>(0); // 密碼嘗試次數
  const [isSudoPrompt, setIsSudoPrompt] = useState<boolean>(false); // 是否處於sudo密碼提示
  const [sudoCommand, setSudoCommand] = useState<string>(''); // 儲存sudo要執行的命令
  const [isFullFeatured, setIsFullFeatured] = useState<boolean>(false); // 是否已啟用完整功能
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const [previousDirectory, setPreviousDirectory] = useState<string | null>(null);
  
  // ASCII Art 名字
  const asciiName = [
    "  _____                _                   ",
    " |  __ \\              (_)                  ",
    " | |  | |  ___ __   __ _  ___   ___  _ __ ",
    " | |  | | / _ \\\\ \\ / /| |/ __| / _ \\| '__|",
    " | |__| ||  __/ \\ V / | |\\__ \\|  __/| |   ",
    " |_____/  \\___|  \\_/  |_||___/ \\___||_|   ",
    "                                           ",
  ];
  
  // 添加更多boot style的消息常量
  const bootHeader = [
    "DeviOS 1.0.0 (Terminal System) " + new Date().toISOString(),
    "Copyright (c) " + new Date().getFullYear() + " Deviser. All rights reserved.",
    "---------------------------------------------------------------",
    ""
  ];
  
  // 添加 Rick Roll ASCII 藝術和歌詞
  const rickRollArt = [
    "⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⢿⡿⣿⣿⡿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⣻⣻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣟⡽⣯⣻⣻⡽⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⢿⣻⣻",
    "⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⢿⡿⣿⣿⣿⣿⣿⣿⡿⣻⣻⣻⣻⣻⣻⡽⣯⣟⢷⠍⠟⠉⠛⢿⢿⣻⣻⢿⣿⣿⣯⣻⡽⣯⣻⣻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣻⢯",
    "⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣻⣻⣻⣻⡟⡅⠀⠀⠀⠠⠀⠀⠆⡹⣻⣻⡽⣯⣻⡽⣯⣻⡽⣻⣻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣻⣻⣻",
    "⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣻⣿⡟⡛⡜⡜⣎⢦⢶⣖⡴⡀⠠⣿⣿⣿⣟⣟⣟⣟⣟⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣻⣻⣻⣻",
    "⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣻⣻⢆⢭⢎⢎⢞⡝⣝⡽⡽⡣⢂⣟⢯⢯⢯⣿⣻⣻⡽⣻⡽⣻⣻⣿⣿⣿⣿⣿⣿⣿⡿⣟⣿⣿⣿⣿⣻",
    "⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⣟⢧⡒⡔⢆⢯⢎⠚⡜⡇⣼⣿⣿⣯⣻⣻⣻⣻⢯⣿⣿⣻⣻⣻⣻⢿⣿⣿⣿⣿⡿⣻⣻⣻⣟⣿⣿",
    "⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⢹⢧⢣⢣⠡⡋⡯⣫⢯⡹⣹⣿⣿⣿⣿⣯⣻⣻⣻⣿⣿⣻⣻⣻⣿⣟⣟⢿⣿⣿⣿⣿⣻⢿⣿⣿⣿",
    "⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠧⢣⢢⢌⣍⡹⡽⣹⣽⣿⣿⣿⣿⣿⡽⣯⣻⢯⣻⢯⣻⣻⣿⣿⣿⣿⣻⣻⣻⣻⢿⢿⣿⣿⣿⣿",
    "⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣟⡽⣍⢎⢎⢝⢏⢏⣝⢿⣿⣿⣿⣿⣿⣿⣻⡽⣯⣻⣻⣿⣿⣟⢿⣿⢿⣻⣻⣿⣿⢿⣿⣿⣿⣿⣿⣿",
    "⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⢿⣿⣿⣟⣟⣟⡜⡜⡜⡝⡭⣫⢫⠂⢫⣿⣿⣿⣟⢯⣻⣻⣻⡽⣻⣿⣿⣿⣟⣿⣿⣿⣻⣟⣟⣿⣿⣿⣿⣿⣿⣿",
    "⣿⣿⣿⣿⢿⡿⣿⢿⡿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⢿⣿⣿⣿⡿⡽⡻⡿⣇⢣⢣⠱⡱⡱⣽⣿⠀⠀⠀⠀⠐⢉⠍⡛⢿⢯⣻⣻⣿⣿⡿⣿⣿⣿⣿⣟⣟⣿⣿⣿⣿⣿⣿⣿⣿",
    "⣿⣿⣿⣿⣿⣿⣿⣿⣟⢿⣿⣿⣿⡿⣿⣿⣟⢿⣻⣻⡿⣏⢋⠀⠀⠀⣹⣻⡇⢣⠱⣥⣻⣿⡿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢹⣿⣿⣻⣿⣿⣿⣟⣟⣟⡽⣻⣿⡿⡿⣿⣿⣿",
    "⣿⣿⣿⣿⣿⢿⣿⣿⣿⢿⣻⣿⢿⣿⣿⢿⣻⣻⣻⡃⠀⠀⠀⠀⠀⠀⠠⠠⡣⢢⠱⡉⠙⠛⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣿⣻⡽⣻⣿⢯⣻⣿⣿⢯⣻⣿⣿⣿⣿⣿⣿",
    "⣿⣿⣿⣿⢿⣻⣻⣿⣟⣟⣟⣿⣿⣿⣿⣿⡿⣟⣟⠄⠀⠀⠀⠀⠀⠀⠀⢀⢆⡑⠡⠉⠋⠖⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⡝⡽⡽⣿⣿⣿⣻⡝⡽",
    "⣯⣯⣯⣯⢯⣫⢫⣻⡿⣻⣿⣿⣿⣿⣿⣻⡽⡽⣭⠂⠀⡰⡱⠡⠢⢂⠆⠀⢠⠰⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⢯⢫⣫⡿⣻⣿⣿⣿⣻⡹",
    "⡿⡿⣻⣻⣻⢭⣚⢧⢫⣻⣿⣿⡿⡽⡽⡽⡽⣹⣝⢇⠄⠀⠀⠄⠄⠄⡐⠀⠄⡐⠐⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡝⣝⡽⣹⢽⢯⡻⣻⣟⢯⢫⣚⣟⣟⣟⣟⣟⣟⡝",
    "⣯⣻⡽⣯⣻⡜⡵⡽⣎⢭⣻⡝⡽⣽⡽⣝⣝⣝⡝⣗⢭⢎⠀⠀⠂⠂⠀⠀⠀⡐⠐⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⣹⣝⣝⡝⣝⡽⡽⡹⣚⠵⡭⢯⢯⢯⣻⡽⡽⣣",
    "⣟⣟⡽⣯⢯⢎⢎⢯⣏⡗⡝⣝⡽⣻⢯⣫⢫⢫⣫⣻⢯⡳⡱⡱⡱⠀⠀⠀⠀⠠⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠐⡝⡝⡝⣝⡝⡝⡭⣫⢫⢭⣚⣝⣝⣝⡽⣹⣹⢧",
    "⢏⠯⢫⢫⢫⢪⢎⢯⢏⠳⡹⡹⣻⡿⡯⣫⢫⡹⡹⡽⡽⡹⡸⡜⡄⠀⠀⢀⢂⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡭⡭⣫⡹⡹⡭⣫⢫⢫⣚⡜⡝⡝⣝⣝⢽⡹⡭",
    "  _____  _      _          _____       _ _ ",
    " |  __ \\(_)    | |        |  __ \\     | | |",
    " | |__) |_  ___| | __     | |__) |___ | | |",
    " |  _  /| |/ __| |/ /     |  _  // _ \\| | |",
    " | | \\ \\| | (__|   <      | | \\ \\ (_) | | |",
    " |_|  \\_\\_|\\___|_|\\_\\     |_|  \\_\\___/|_|_|",
    "                                           ",
    " 永不放棄你  永不讓你失望  永不轉身離開你 "
  ];

  // 定義語言資源
  const textResources: TextResources = {
    // 命令幫助文本
    'help_title': {
      'zh_TW': '=== 可用命令列表 ===',
      'en_US': '=== Available Commands ==='
    },
    'help_ls': {
      'zh_TW': 'ls          - 列出當前目錄內容',
      'en_US': 'ls          - List directory contents'
    },
    'help_cd': {
      'zh_TW': 'cd [目錄]    - 切換目錄',
      'en_US': 'cd [dir]    - Change directory'
    },
    'help_cat': {
      'zh_TW': 'cat [檔案]   - 顯示檔案內容',
      'en_US': 'cat [file]  - Display file contents'
    },
    'help_pwd': {
      'zh_TW': 'pwd         - 顯示當前路徑',
      'en_US': 'pwd         - Print working directory'
    },
    'help_whoami': {
      'zh_TW': 'whoami      - 顯示當前使用者',
      'en_US': 'whoami      - Display current user'
    },
    'help_date': {
      'zh_TW': 'date        - 顯示當前日期',
      'en_US': 'date        - Display current date'
    },
    'help_man': {
      'zh_TW': 'man [命令]   - 顯示命令說明',
      'en_US': 'man [cmd]   - Display command manual'
    },
    'help_echo': {
      'zh_TW': 'echo [文字]  - 顯示文字',
      'en_US': 'echo [text] - Display text'
    },
    'help_uname': {
      'zh_TW': 'uname       - 顯示系統資訊',
      'en_US': 'uname       - Display system info'
    },
    'help_find': {
      'zh_TW': 'find        - 搜尋檔案或目錄',
      'en_US': 'find        - Search files or directories'
    },
    'help_mkdir': {
      'zh_TW': 'mkdir       - 建立目錄',
      'en_US': 'mkdir       - Create directory'
    },
    'help_github': {
      'zh_TW': 'github      - 顯示GitHub資訊',
      'en_US': 'github      - Display GitHub info'
    },
    'help_theme': {
      'zh_TW': 'theme       - 切換亮色/暗色主題',
      'en_US': 'theme       - Toggle light/dark theme'
    },
    'help_lang': {
      'zh_TW': 'lang        - 切換語言 (中文/英文)',
      'en_US': 'lang        - Change language (Chinese/English)'
    },
    'help_clear': {
      'zh_TW': 'clear       - 清除畫面',
      'en_US': 'clear       - Clear screen'
    },
    'help_exit': {
      'zh_TW': 'exit        - 離開終端機',
      'en_US': 'exit        - Exit terminal'
    },
    'help_shortcuts': {
      'zh_TW': '鍵盤快捷鍵:',
      'en_US': 'Keyboard shortcuts:'
    },
    'help_ctrl_c': {
      'zh_TW': 'Ctrl+C        - 中斷當前命令',
      'en_US': 'Ctrl+C        - Interrupt current command'
    },
    'help_ctrl_l': {
      'zh_TW': 'Ctrl+L        - 清除畫面',
      'en_US': 'Ctrl+L        - Clear screen'
    },
    'help_ctrl_d': {
      'zh_TW': 'Ctrl+D        - 登出 (當輸入為空時)',
      'en_US': 'Ctrl+D        - Logout (when input is empty)'
    },
    'help_ctrl_u': {
      'zh_TW': 'Ctrl+U        - 清除當前輸入行',
      'en_US': 'Ctrl+U        - Clear current input line'
    },
    'help_tab': {
      'zh_TW': 'Tab           - 自動完成命令',
      'en_US': 'Tab           - Auto-complete command'
    },
    'help_arrows': {
      'zh_TW': '↑/↓           - 瀏覽命令歷史記錄',
      'en_US': '↑/↓           - Browse command history'
    },
    
    // 錯誤訊息
    'err_cmd_not_found': {
      'zh_TW': '命令未找到，輸入 "help" 查看可用命令',
      'en_US': 'Command not found, type "help" to see available commands'
    },
    'err_invalid_option': {
      'zh_TW': '無效的選項',
      'en_US': 'Invalid option'
    },
    'err_dir_not_exist': {
      'zh_TW': '沒有此目錄',
      'en_US': 'No such directory'
    },
    'err_file_not_exist': {
      'zh_TW': '檔案不存在或不是檔案',
      'en_US': 'File does not exist or is not a file'
    },
    'err_missing_file': {
      'zh_TW': '缺少檔案名稱',
      'en_US': 'Missing filename'
    },
    'err_perm_denied': {
      'zh_TW': '權限不足',
      'en_US': 'Permission denied'
    },
    
    // 系統訊息
    'sys_welcome': {
      'zh_TW': '歡迎來到 DeviOS 終端機系統!',
      'en_US': 'Welcome to DeviOS Terminal System!'
    },
    'sys_last_login': {
      'zh_TW': '上次登入：',
      'en_US': 'Last login: '
    },
    'sys_os_version': {
      'zh_TW': '系統：DeviOS 1.0.0 LTS',
      'en_US': 'System: DeviOS 1.0.0 LTS'
    },
    'sys_enter_help': {
      'zh_TW': '輸入 "help" 查看可用命令。',
      'en_US': 'Type "help" to see available commands.'
    },
    'sys_theme_changed': {
      'zh_TW': '主題已切換',
      'en_US': 'Theme changed'
    },
    'sys_lang_changed': {
      'zh_TW': '語言已切換為中文',
      'en_US': 'Language changed to English'
    },
    'sys_lang_usage': {
      'zh_TW': '使用方式: lang [zh|en]\n例如: lang en - 切換至英文\n      lang zh - 切換至中文',
      'en_US': 'Usage: lang [zh|en]\nExample: lang en - Switch to English\n         lang zh - Switch to Chinese'
    },
    'sys_goodbye': {
      'zh_TW': '感謝使用終端機風格個人網站，再見！',
      'en_US': 'Thank you for using terminal-style portfolio website. Goodbye!'
    },
    'sys_logout': {
      'zh_TW': 'logout',
      'en_US': 'logout'
    },
    
    // 目錄和導航
    'nav_switch_to_dir': {
      'zh_TW': '切換到 $1 目錄查看更多資訊',
      'en_US': 'Switch to $1 directory to see more information'
    },
    'nav_use_cd': {
      'zh_TW': '使用 "cd $1" 命令',
      'en_US': 'Use "cd $1" command'
    },
    'nav_use_ls': {
      'zh_TW': '請使用 "ls" 查看可用檔案，並使用 "cat [檔案名]" 閱讀內容',
      'en_US': 'Please use "ls" to see available files, and "cat [filename]" to read content'
    },
    'nav_example': {
      'zh_TW': '例如: $1',
      'en_US': 'Example: $1'
    },
    'err_missing_operand': {
      'zh_TW': '缺少操作數',
      'en_US': 'missing operand'
    }
  };

  // 獲取對應語言的文本
  const getText = (key: string, ...params: string[]): string => {
    let text = textResources[key]?.[language] || key;
    
    // 替換參數
    params.forEach((param, index) => {
      text = text.replace(`$${index + 1}`, param);
    });
    
    return text;
  };
  
  // 定義檔案系統結構
  const fileSystem: FileSystem = {
    '~': {
      type: 'directory',
      content: {
        'about': {
          type: 'directory',
          content: {
            'bio.txt': {
              type: 'file',
              content: [
                '====== 關於我 ======',
                '我是一名熱衷於前端與全端開發的軟體工程師，擁有豐富的網頁應用開發經驗。',
                '我熱愛創造直覺且美觀的使用者介面，並且重視程式碼品質與使用者體驗。',
                '在工作之外，我也是開源專案的貢獻者，喜歡分享知識並持續學習新技術。',
                '我的GitHub: https://github.com/Thetoicxdude'
              ],
              contentEn: [
                '====== About Me ======',
                'I am a software engineer passionate about frontend and full-stack development, with extensive experience in web application development.',
                'I love creating intuitive and beautiful user interfaces, and I value code quality and user experience.',
                'Outside of work, I am also an open-source contributor, enjoying knowledge sharing and continuously learning new technologies.',
                'My GitHub: https://github.com/Thetoicxdude'
              ],
              permissions: 'rw-r--r--',
              owner: 'deviser',
              group: 'users',
              lastModified: new Date()
            },
            'education.txt': {
              type: 'file',
              content: [
                '====== 教育背景 ======',
                '2019-2023 - 計算機科學學士',
                '主修領域：軟體工程、網頁開發、人工智能'
              ],
              contentEn: [
                '====== Education ======',
                '2019-2023 - Bachelor of Computer Science',
                'Major fields: Software Engineering, Web Development, Artificial Intelligence'
              ],
              permissions: 'rw-r--r--',
              owner: 'deviser',
              group: 'users',
              lastModified: new Date()
            },
            'experience.txt': {
              type: 'file',
              content: [
                '====== 工作經驗 ======',
                '2022-至今 - 高級前端開發者',
                '2020-2022 - 網頁開發實習生',
                '主要職責：開發與維護企業級網頁應用，設計用戶介面，優化前端性能'
              ],
              contentEn: [
                '====== Work Experience ======',
                '2022-Present - Senior Frontend Developer',
                '2020-2022 - Web Development Intern',
                'Main responsibilities: Developing and maintaining enterprise web applications, designing user interfaces, optimizing frontend performance'
              ],
              permissions: 'rw-r--r--',
              owner: 'deviser',
              group: 'users',
              lastModified: new Date()
            }
          },
          permissions: 'rwxr-xr-x',
          owner: 'deviser',
          group: 'users',
          lastModified: new Date()
        },
        'skills': {
          type: 'directory',
          content: {
            'frontend.txt': {
              type: 'file',
              content: [
                '====== 前端技術 ======',
                'JavaScript/TypeScript ███████████ 95%',
                'React.js            ██████████  90%',
                'Vue.js              ████████    80%',
                'HTML/CSS            ███████████ 95%'
              ],
              contentEn: [
                '====== Frontend Technologies ======',
                'JavaScript/TypeScript ███████████ 95%',
                'React.js            ██████████  90%',
                'Vue.js              ████████    80%',
                'HTML/CSS            ███████████ 95%'
              ],
              permissions: 'rw-r--r--',
              owner: 'deviser',
              group: 'users',
              lastModified: new Date()
            },
            'backend.txt': {
              type: 'file',
              content: [
                '====== 後端技術 ======',
                'Node.js             ████████    80%',
                'Express             ███████     70%',
                'Python              ██████      60%',
                'Database            ████████    80%'
              ],
              contentEn: [
                '====== Backend Technologies ======',
                'Node.js             ████████    80%',
                'Express             ███████     70%',
                'Python              ██████      60%',
                'Database            ████████    80%'
              ],
              permissions: 'rw-r--r--',
              owner: 'deviser',
              group: 'users',
              lastModified: new Date()
            },
            'other.txt': {
              type: 'file',
              content: [
                '====== 其他技能 ======',
                'Git/GitHub          ██████████  90%',
                'Discord Bots        ████████    80%',
                'AI & ML             █████████   85%',
                'Linux               █████████   85%'
              ],
              contentEn: [
                '====== Other Skills ======',
                'Git/GitHub          ██████████  90%',
                'Discord Bots        ████████    80%',
                'AI & ML             █████████   85%',
                'Linux               █████████   85%'
              ],
              permissions: 'rw-r--r--',
              owner: 'deviser',
              group: 'users',
              lastModified: new Date()
            }
          },
          permissions: 'rwxr-xr-x',
          owner: 'deviser',
          group: 'users',
          lastModified: new Date()
        },
        'projects': {
          type: 'directory',
          content: {
            'terminal-portfolio': {
              type: 'directory',
              content: {
                'README.md': {
                  type: 'file',
                  content: [
                    '# 終端機風格個人網站',
                    '使用 React 和 TypeScript 建立的終端機風格個人網站',
                    '',
                    '## 技術',
                    '- React',
                    '- TypeScript',
                    '- Styled-Components',
                    '',
                    '## 功能',
                    '- 互動式命令行介面',
                    '- 主題切換',
                    '- 響應式設計',
                    '',
                    '## 連結',
                    'https://github.com/Thetoicxdude/terminal-portfolio'
                  ],
                  permissions: 'rw-r--r--',
                  owner: 'deviser',
                  group: 'users',
                  lastModified: new Date()
                }
              },
              permissions: 'rwxr-xr-x',
              owner: 'deviser',
              group: 'users',
              lastModified: new Date()
            },
            'ai-transformer': {
              type: 'directory',
              content: {
                'README.md': {
                  type: 'file',
                  content: [
                    '# AI Transformer',
                    '實現和研究的Transformer模型專案',
                    '',
                    '## 技術',
                    '- Python',
                    '- PyTorch',
                    '- 自然語言處理',
                    '',
                    '## 功能',
                    '- 實現transformer架構',
                    '- 文本處理與分析',
                    '- 模型訓練與評估',
                    '',
                    '## 連結',
                    'https://github.com/Thetoicxdude/Ai-transformer'
                  ],
                  permissions: 'rw-r--r--',
                  owner: 'deviser',
                  group: 'users',
                  lastModified: new Date()
                }
              },
              permissions: 'rwxr-xr-x',
              owner: 'deviser',
              group: 'users',
              lastModified: new Date()
            },
            'crowdfunding-platform': {
              type: 'directory',
              content: {
                'README.md': {
                  type: 'file',
                  content: [
                    '# 眾籌平台',
                    '現代化的眾籌網站平台',
                    '',
                    '## 技術',
                    '- JavaScript',
                    '- React',
                    '- Node.js',
                    '- 支付整合',
                    '',
                    '## 功能',
                    '- 專案創建與展示',
                    '- 支付系統整合',
                    '- 用戶認證',
                    '- 專案管理儀表板',
                    '',
                    '## 連結',
                    'https://github.com/Thetoicxdude/crowdfunding-platform'
                  ],
                  permissions: 'rw-r--r--',
                  owner: 'deviser',
                  group: 'users',
                  lastModified: new Date()
                }
              },
              permissions: 'rwxr-xr-x',
              owner: 'deviser',
              group: 'users',
              lastModified: new Date()
            },
            'implicit-sentiment-analysis': {
              type: 'directory',
              content: {
                'README.md': {
                  type: 'file',
                  content: [
                    '# 隱含情感分析模型',
                    '用於分析文本中隱含情感的AI模型',
                    '',
                    '## 技術',
                    '- Python',
                    '- 機器學習',
                    '- 自然語言處理',
                    '- 深度學習',
                    '',
                    '## 功能',
                    '- 情感分析',
                    '- 文本分類',
                    '- 隱含情感檢測',
                    '',
                    '## 連結',
                    'https://github.com/Thetoicxdude/Implicit-sentiment-analysis-model'
                  ],
                  permissions: 'rw-r--r--',
                  owner: 'deviser',
                  group: 'users',
                  lastModified: new Date()
                }
              },
              permissions: 'rwxr-xr-x',
              owner: 'deviser',
              group: 'users',
              lastModified: new Date()
            },
            'starhub-server': {
              type: 'directory',
              content: {
                'README.md': {
                  type: 'file',
                  content: [
                    '# Starhub Server',
                    '使用GitHub Pages建立的網站專案',
                    '',
                    '## 技術',
                    '- HTML',
                    '- CSS',
                    '- JavaScript',
                    '- GitHub Pages',
                    '',
                    '## 功能',
                    '- 靜態網站展示',
                    '- 資訊頁面',
                    '- 響應式設計',
                    '',
                    '## 連結',
                    'https://github.com/Thetoicxdude/Starhub-Server-.github.io'
                  ],
                  permissions: 'rw-r--r--',
                  owner: 'deviser',
                  group: 'users',
                  lastModified: new Date()
                }
              },
              permissions: 'rwxr-xr-x',
              owner: 'deviser',
              group: 'users',
              lastModified: new Date()
            },
            'zu-discord-bot': {
              type: 'directory',
              content: {
                'README.md': {
                  type: 'file',
                  content: [
                    '# Zu Discord Bot',
                    'Discord聊天機器人專案',
                    '',
                    '## 技術',
                    '- JavaScript/TypeScript',
                    '- Discord.js',
                    '- Node.js',
                    '',
                    '## 功能',
                    '- 聊天指令處理',
                    '- 自動化任務',
                    '- 互動式回應',
                    '- 音樂播放與管理',
                    '',
                    '## 連結',
                    'https://github.com/Thetoicxdude/Zu-discord-bot'
                  ],
                  permissions: 'rw-r--r--',
                  owner: 'deviser',
                  group: 'users',
                  lastModified: new Date()
                }
              },
              permissions: 'rwxr-xr-x',
              owner: 'deviser',
              group: 'users',
              lastModified: new Date()
            }
          },
          permissions: 'rwxr-xr-x',
          owner: 'deviser',
          group: 'users',
          lastModified: new Date()
        },
        'contact': {
          type: 'directory',
          content: {
            'info.txt': {
              type: 'file',
              content: [
                '====== 聯絡方式 ======',
                '📧 Email: yourname@example.com',
                '💼 LinkedIn: linkedin.com/in/yourprofile',
                '🐱 GitHub: https://github.com/Thetoicxdude',
                '🐦 Twitter: @yourhandle'
              ],
              contentEn: [
                '====== Contact Information ======',
                '📧 Email: yourname@example.com',
                '💼 LinkedIn: linkedin.com/in/yourprofile',
                '🐱 GitHub: https://github.com/Thetoicxdude',
                '🐦 Twitter: @yourhandle'
              ],
              permissions: 'rw-r--r--',
              owner: 'deviser',
              group: 'users',
              lastModified: new Date()
            },
            'social.txt': {
              type: 'file',
              content: [
                '====== 社交媒體 ======',
                'Instagram: @yourhandle',
                'Facebook: yourname',
                'Discord: yourname#1234'
              ],
              contentEn: [
                '====== Social Media ======',
                'Instagram: @yourhandle',
                'Facebook: yourname',
                'Discord: yourname#1234'
              ],
              permissions: 'rw-r--r--',
              owner: 'deviser',
              group: 'users',
              lastModified: new Date()
            }
          },
          permissions: 'rwxr-xr-x',
          owner: 'deviser',
          group: 'users',
          lastModified: new Date()
        },
        '.github': {
          type: 'directory',
          content: {
            'profile.txt': {
              type: 'file',
              content: [
                '====== GitHub 資訊 ======',
                '用戶名: Thetoicxdude',
                '個人檔案: https://github.com/Thetoicxdude',
                '儲存庫數量: 11',
                '追蹤者: 0',
                '追蹤中: 1',
                '成就: Pull Shark',
                '',
                '主要專案:',
                '- Ai-transformer',
                '- crowdfunding-platform',
                '- Implicit-sentiment-analysis-model',
                '- Starhub-Server-.github.io',
                '- Zu-discord-bot'
              ],
              permissions: 'rw-r--r--',
              owner: 'deviser',
              group: 'users',
              lastModified: new Date()
            },
            'stats.txt': {
              type: 'file',
              content: [
                '====== GitHub 統計 ======',
                '主要語言: JavaScript, Python, HTML, TypeScript',
                '貢獻統計: 活躍貢獻者',
                '星標專案: 4',
                '',
                '最近活動:',
                '- 專案更新',
                '- 提交代碼',
                '- Fork了開源專案'
              ],
              permissions: 'rw-r--r--',
              owner: 'deviser',
              group: 'users',
              lastModified: new Date()
            }
          },
          permissions: 'rwxr-xr-x',
          owner: 'deviser',
          group: 'users',
          lastModified: new Date()
        },
        'resume.pdf': {
          type: 'file',
          content: ['[PDF 文件內容 - 顯示為二進制]'],
          permissions: 'rw-r--r--',
          owner: 'deviser',
          group: 'users',
          lastModified: new Date()
        },
        '.bashrc': {
          type: 'file',
          content: [
            '# .bashrc',
            'PS1="\\[\\033[01;32m\\]\\u@\\h\\[\\033[00m\\]:\\[\\033[01;34m\\]\\w\\[\\033[00m\\]\\$ "',
            'alias ll="ls -la"',
            'alias la="ls -a"',
            'alias l="ls -CF"',
            'alias gh="cd ~/.github"'
          ],
          permissions: 'rw-r--r--',
          owner: 'deviser',
          group: 'users',
          lastModified: new Date()
        }
      },
      permissions: 'rwxr-xr-x',
      owner: 'deviser',
      group: 'users',
      lastModified: new Date()
    }
  };
  
  // 獲取當前目錄的內容，修復類型錯誤
  const getCurrentDirectoryContent = (): Record<string, FileSystemItem> | null => {
    const path = currentDirectory === '~' ? ['~'] : currentDirectory.split('/');
    
    let current: any = fileSystem;
    for (const dir of path) {
      if (!dir) continue; // 處理連續的斜線
      if (current[dir] && current[dir].type === 'directory') {
        current = current[dir].content;
      } else {
        return null; // 目錄不存在
      }
    }
    
    return current as Record<string, FileSystemItem>;
  };
  
  // 獲取檔案內容，根據當前語言返回
  const getFileContent = (filePath: string): string[] | null => {
    const isAbsolutePath = filePath.startsWith('/');
    const normalizedPath = isAbsolutePath 
      ? filePath.substring(1) // 去掉開頭的斜線
      : (currentDirectory === '~' 
        ? filePath 
        : `${currentDirectory.substring(2)}/${filePath}`);
    
    const parts = normalizedPath.split('/').filter(p => p);
    
    let current: any = fileSystem['~'].content;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (current[part] && current[part].type === 'directory') {
        current = current[part].content;
      } else {
        return null; // 路徑不存在
      }
    }
    
    const fileName = parts[parts.length - 1];
    if (current[fileName] && current[fileName].type === 'file') {
      // 根據當前語言返回相應內容
      if (language === 'en_US' && current[fileName].contentEn) {
        return current[fileName].contentEn as string[];
      }
      return current[fileName].content as string[];
    }
    
    return null; // 檔案不存在
  };
  
  // 初始化時顯示歡迎訊息
  useEffect(() => {
    // 根據當前語言顯示相應的歡迎訊息
    if (language === 'zh_TW') {
      setOutputHistory([{
        command: '',
        result: [
          { type: 'system', content: '=========== Deviser 終端機 v1.0.0 ===========' },
          { type: 'success', content: '歡迎使用 Deviser 終端機風格個人網站！' },
          { type: 'info', content: '基本使用說明:' },
          { type: 'success', content: '輸入 "help" 查看可用命令列表' },
          { type: 'success', content: '輸入 "deviser start" 啟動 deviser 服務。' }
        ]
      }]);
    } else {
      setOutputHistory([{
        command: '',
        result: [
          { type: 'system', content: '=========== Deviser Terminal v1.0.0 ===========' },
          { type: 'success', content: 'Welcome to Deviser Terminal-style Personal Website!' },
          { type: 'info', content: 'Basic Usage Guide:' },
          { type: 'success', content: '1. Type "help" to see available commands' },
          { type: 'info', content: 'Start exploring! Type "deviser start" to enable all features.' }
        ]
      }]);
    }
  }, []);
  
  useEffect(() => {
    // 模擬啟動序列
    if (isBooting) {
      // 計算總的啟動階段數
      const totalStages = bootHeader.length + asciiName.length + bootMessages.length;
      
      if (bootStage < totalStages) {
        const timer = setTimeout(() => {
          setBootStage(prev => prev + 1);
        }, getDelayForStage(bootStage));
        
        return () => clearTimeout(timer);
      } else {
        // 啟動序列完成後短暫停頓
        const finishTimer = setTimeout(() => {
          // 啟動序列完成
          setIsBooting(false);
          
          // 顯示歡迎消息
          const welcomeMessages: CommandResult[] = [
            { 
              type: 'system', 
              content: getText('sys_welcome')
            },
            { 
              type: 'success', 
              content: getText('sys_last_login') + new Date().toLocaleString() 
            },
            { 
              type: 'system',
              content: getText('sys_os_version')
            },
            { 
              type: 'info',
              content: getText('sys_enter_help')
            }
          ];
          
          setOutputHistory([{ command: '', result: welcomeMessages }]);
        }, 800); // 啟動完成後等待800ms再顯示歡迎信息
        
        return () => clearTimeout(finishTimer);
      }
    }
    
    // 自動聚焦輸入框
    if (!isBooting && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isBooting, bootStage, language]);
  
  // 根據啟動階段返回適當的延遲時間
  const getDelayForStage = (stage: number): number => {
    if (stage < bootHeader.length) {
      return 30; // 頭部信息顯示速度
    } else if (stage < bootHeader.length + asciiName.length) {
      return 10; // ASCII 藝術顯示速度
    } else {
      // 啟動消息顯示速度
      return bootMessages[stage - bootHeader.length - asciiName.length].delay;
    }
  };

  useEffect(() => {
    // 確保輸出框始終滾動到底部
    if (outputRef.current) {
      // 只在新增命令或啟動序列時自動滾動
      const isNewCommand = outputHistory.length > 0 && 
                           outputHistory[outputHistory.length - 1].result.length <= 1;
      
      // 只有在以下情況自動滾動：
      // 1. 啟動序列期間
      // 2. 新命令輸入後（結果很少）
      // 3. 清屏後
      // 其他情況（例如大量輸出）不自動滾動
      if (isBooting || isNewCommand || outputHistory.length === 0) {
        outputRef.current.scrollTop = outputRef.current.scrollHeight;
      }
    }
  }, [outputHistory, bootStage, isBooting]);

  useEffect(() => {
    // 更新光標位置
    setCursorPosition(input.length);
    
    // 保持輸入框聚焦
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [input]);

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // 如果是sudo密碼輸入，不顯示密碼
    const displayCmd = isSudoPrompt ? '' : input;
    
    // 即使沒有命令也添加到歷史記錄
    if (!input.trim()) {
      // 直接顯示一個新的提示符
      setOutputHistory(prev => [...prev, { command: '', result: [] }]);
      return;
    }
    
    // 將命令添加到歷史記錄中，但如果是密碼則不添加
    if (!isSudoPrompt) {
      setCommandHistory(prev => [...prev, input]);
    }
    setHistoryIndex(-1);
    
    // 處理命令
    const result = processCommand(input.trim());
    
    // 添加到輸出歷史記錄
    setOutputHistory(prev => [...prev, { command: displayCmd, result }]);
    
    // 清空輸入
    setInput('');
    setCursorPosition(0);
    
    // 如果是clear命令，則自動滾動
    if (input.trim().toLowerCase() === 'clear') {
      setTimeout(() => {
        if (outputRef.current) {
          outputRef.current.scrollTop = 0;
        }
      }, 50);
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 處理上下箭頭鍵瀏覽命令歷史
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setInput(commandHistory[commandHistory.length - 1 - newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(commandHistory[commandHistory.length - 1 - newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInput('');
      }
    } else if (e.key === 'ArrowLeft') {
      // 更新光標位置 - 左移
      const newPosition = Math.max(0, cursorPosition - 1);
      setCursorPosition(newPosition);
    } else if (e.key === 'ArrowRight') {
      // 更新光標位置 - 右移
      const newPosition = Math.min(input.length, cursorPosition + 1);
      setCursorPosition(newPosition);
    } else if (e.key === 'Home') {
      // 移至行首
      setCursorPosition(0);
    } else if (e.key === 'End') {
      // 移至行尾
      setCursorPosition(input.length);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      // 簡單的自動完成
      if (input.startsWith('p')) {
        setInput('projects');
      } else if (input.startsWith('a')) {
        setInput('about');
      } else if (input.startsWith('s')) {
        setInput('skills');
      } else if (input.startsWith('c')) {
        setInput('contact');
      } else if (input.startsWith('t')) {
        setInput('theme');
      } else if (input.startsWith('h')) {
        setInput('help');
      } else if (input.startsWith('cl')) {
        setInput('clear');
      }
    } else if (e.ctrlKey) {
      // Linux 快捷鍵
      switch (e.key) {
        case 'c': // Ctrl+C 中斷
          e.preventDefault();
          if (input) {
            setOutputHistory(prev => [...prev, { 
              command: input, 
              result: [{ type: 'error', content: '^C' }] 
            }]);
            setInput('');
            setCursorPosition(0);
          } else {
            setOutputHistory(prev => [...prev, { 
              command: '', 
              result: [{ type: 'error', content: '^C' }] 
            }]);
          }
          break;

        case 'l': // Ctrl+L 清屏
          e.preventDefault();
          setOutputHistory([]);
          break;

        case 'd': // Ctrl+D 登出/EOF
          e.preventDefault();
          if (!input) {
            setOutputHistory(prev => [...prev, { 
              command: '', 
              result: [
                { type: 'system', content: 'logout' },
                { type: 'system', content: '感謝使用終端機風格個人網站！' }
              ] 
            }]);
            // 可以添加一個模擬重新登入的延遲
            setTimeout(() => {
              setOutputHistory([{
                command: '',
                result: [
                  { type: 'system', content: '歡迎回到 Linux 風格的終端機個人網站!' },
                  { type: 'info', content: '輸入 "help" 查看可用命令。' }
                ]
              }]);
            }, 2000);
          }
          break;

        case 'u': // Ctrl+U 清除當前行
          e.preventDefault();
          setInput('');
          setCursorPosition(0);
          break;

        case 'a': // Ctrl+A 移至行首
          e.preventDefault();
          setCursorPosition(0);
          break;
          
        case 'e': // Ctrl+E 移至行尾
          e.preventDefault();
          setCursorPosition(input.length);
          break;
      }
    }
  };
  
  const processCommand = (cmd: string): CommandResult[] => {
    // 處理 sudo 密碼輸入
    if (isSudoPrompt) {
      setIsSudoPrompt(false);
      
      // 檢查密碼 (這裡簡化為 "password")
      if (cmd === 'password') {
        setIsRoot(true);
        
        // 執行原始 sudo 命令
        const originalCmd = sudoCommand;
        setSudoCommand('');
        
        return [
          { type: 'system', content: '' }, // 密碼不顯示
          ...processCommand(originalCmd)
        ];
      } else {
        setPasswordAttempts(prev => prev + 1);
        
        if (passwordAttempts >= 2) {
          setPasswordAttempts(0);
          setSudoCommand('');
          return [{ type: 'error', content: 'sudo: 3 次錯誤的密碼嘗試' }];
        }
        
        return [{ type: 'error', content: 'sudo: 認證失敗' }];
      }
    }

    // 特殊處理，支援管道和重定向
    if (cmd.includes('|')) {
      return [{ type: 'error', content: '目前尚未支援管道功能 (|)' }];
    }

    if (cmd.includes('>') || cmd.includes('>>')) {
      return [{ type: 'error', content: '目前尚未支援重定向功能 (> 或 >>)' }];
    }

    // 檢查是否是 rm -rf 命令
    if (cmd.startsWith('rm -rf') || cmd.startsWith('rm -fr')) {
      return rickRoll();
    }

    const [command, ...args] = cmd.split(' ');
    
    // 處理 deviser start 命令 - 啟用完整功能
    if (command.toLowerCase() === 'deviser' && args[0]?.toLowerCase() === 'start') {
      // 檢查模式是否已經啟用，避免重複啟動
      if (isFullFeatured) {
        return [
          { type: 'info', content: 'deviser 服務已經啟動！' }
        ];
      }

      // 立即設置為 deviser 服務模式
      setIsFullFeatured(true);
      setUserName('deviser');
      
      // 設置啟動狀態和重置啟動階段
      setIsBooting(true);
      setBootStage(0);
      
      // 改進的啟動序列，有明顯的停頓感
      const runBootSequence = async () => {
        // 顯示初始啟動訊息
        setOutputHistory(prev => [...prev, { 
          command: 'deviser start', 
          result: [{ type: 'system', content: '正在啟動 deviser 服務...' }] 
        }]);
        
        // 使用更有節奏的延遲顯示啟動消息
        for (let i = 0; i < bootMessages.length; i++) {
          // 等待一段時間再顯示下一條消息
          await new Promise(resolve => setTimeout(resolve, 600));
          
          // 添加啟動消息到輸出歷史
          setOutputHistory(prev => {
            const lastOutput = [...prev];
            const lastIndex = lastOutput.length - 1;
            
            if (lastOutput[lastIndex]) {
              const msg = bootMessages[i].msg[language];
              lastOutput[lastIndex].result = [
                ...lastOutput[lastIndex].result,
                { type: 'system', content: msg }
              ];
            }
            
            return lastOutput;
          });
        }
        
        // 啟動完成後顯示成功消息並短暫停頓
        await new Promise(resolve => setTimeout(resolve, 800));
        
        setOutputHistory(prev => {
          const lastOutput = [...prev];
          const lastIndex = lastOutput.length - 1;
          
          if (lastOutput[lastIndex]) {
            lastOutput[lastIndex].result = [
              ...lastOutput[lastIndex].result,
              { type: 'success', content: 'deviser 服務已啟動！' }
            ];
          }
          
          return lastOutput;
        });
        
        // 再等待一下，然後清空終端並設置為非啟動狀態
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 清空終端，顯示乾淨的狀態
        setOutputHistory([]);
        
        // 設置為非啟動狀態
        setIsBooting(false);
        
        // 添加一條簡短的歡迎消息
        setTimeout(() => {
          setOutputHistory([{
            command: '',
            result: [
              { 
                type: 'success', 
                content: language === 'zh_TW' 
                  ? '✓ deviser 服務已成功啟動！輸入 "help" 查看可用命令。' 
                  : '✓ deviser service started successfully! Type "help" to see available commands.'
              }
            ]
          }]);
        }, 100);
      };
      
      // 運行改進的啟動序列
      runBootSequence();
      
      return [];
    }
    
    // 非完整功能模式下的有限命令支援
    if (!isFullFeatured) {
      // 基本命令列表
      const basicCommands = ['help', 'clear', 'echo', 'exit', 'deviser', 'ls', 'cd', 'cat', 'pwd', 'whoami', 'date', 'uname', 'lang'];
      
      if (!basicCommands.includes(command.toLowerCase()) && command.toLowerCase() !== '') {
        return [
          { type: 'error', content: language === 'zh_TW' ? `未知的命令: ${command}` : `Unknown command: ${command}` },
          { type: 'info', content: language === 'zh_TW' ? '提示: 輸入 "deviser start" 以啟動 deviser 服務' : 'Tip: Type "deviser start" to start deviser service' },
          { type: 'info', content: language === 'zh_TW' ? '輸入 "help" 查看基本命令列表' : 'Type "help" to see basic command list' }
        ];
      }
      
      // 基本幫助命令
      if (command.toLowerCase() === 'help') {
        if (language === 'zh_TW') {
          return [
            { type: 'system', content: '=== 基本命令列表 ===' },
            { type: 'success', content: 'help        - 顯示此幫助信息' },
            { type: 'success', content: 'ls          - 列出當前目錄內容' },
            { type: 'success', content: 'cd [目錄]    - 切換目錄' },
            { type: 'success', content: 'cat [檔案]   - 顯示檔案內容' },
            { type: 'success', content: 'pwd         - 顯示當前路徑' },
            { type: 'success', content: 'whoami      - 顯示當前使用者' },
            { type: 'success', content: 'date        - 顯示當前日期' },
            { type: 'success', content: 'clear       - 清除畫面' },
            { type: 'success', content: 'echo [文字]  - 顯示文字' },
            { type: 'success', content: 'uname       - 顯示系統資訊' },
            { type: 'success', content: 'lang        - 切換語言 (中文/英文)' },
            { type: 'success', content: 'deviser start - 啟動 deviser 服務' },
            { type: 'success', content: 'exit        - 離開終端機' },
            { type: 'info', content: '提示: 輸入 "deviser start" 以啟動 deviser 服務以顯示更多內容' }
          ];
        } else {
          return [
            { type: 'system', content: '=== Basic Command List ===' },
            { type: 'success', content: 'help        - Show this help message' },
            { type: 'success', content: 'ls          - List directory contents' },
            { type: 'success', content: 'cd [dir]    - Change directory' },
            { type: 'success', content: 'cat [file]  - Show file contents' },
            { type: 'success', content: 'pwd         - Print working directory' },
            { type: 'success', content: 'whoami      - Show current user' },
            { type: 'success', content: 'date        - Show current date' },
            { type: 'success', content: 'clear       - Clear screen' },
            { type: 'success', content: 'echo [text] - Display text' },
            { type: 'success', content: 'uname       - Display system information' },
            { type: 'success', content: 'lang        - Change language (Chinese/English)' },
            { type: 'success', content: 'deviser start - Start deviser service' },
            { type: 'success', content: 'exit        - Exit terminal' },
            { type: 'info', content: 'Tip: Type "deviser start" to start deviser service and see more content' }
          ];
        }
      }
    }
    
    switch (command.toLowerCase()) {
      case 'help':
        return [
          { type: 'system', content: getText('help_title') },
          { type: 'success', content: getText('help_ls') },
          { type: 'success', content: getText('help_cd') },
          { type: 'success', content: getText('help_cat') },
          { type: 'success', content: getText('help_pwd') },
          { type: 'success', content: getText('help_whoami') },
          { type: 'success', content: getText('help_date') },
          { type: 'success', content: getText('help_man') },
          { type: 'success', content: getText('help_echo') },
          { type: 'success', content: getText('help_uname') },
          { type: 'success', content: getText('help_find') },
          { type: 'success', content: getText('help_mkdir') },
          { type: 'success', content: getText('help_github') },
          { type: 'success', content: getText('help_theme') },
          { type: 'success', content: getText('help_lang') },
          { type: 'success', content: getText('help_clear') },
          { type: 'success', content: getText('help_exit') },
          { type: 'info', content: getText('help_shortcuts') },
          { type: 'info', content: getText('help_ctrl_c') },
          { type: 'info', content: getText('help_ctrl_l') },
          { type: 'info', content: getText('help_ctrl_d') },
          { type: 'info', content: getText('help_ctrl_u') },
          { type: 'info', content: getText('help_tab') },
          { type: 'info', content: getText('help_arrows') },
        ];
      
      case 'about':
        if (currentDirectory !== '~/about') {
          return [
            { type: 'info', content: getText('nav_switch_to_dir', 'about') },
            { type: 'info', content: getText('nav_use_cd', 'about') }
          ];
        }
        
        return [
          { type: 'info', content: '====== ' + (language === 'zh_TW' ? '關於我' : 'About Me') + ' ======' },
          { type: 'success', content: getText('nav_use_ls') },
          { type: 'success', content: getText('nav_example', 'cat bio.txt') }
        ];
      
      case 'skills':
        if (currentDirectory !== '~/skills') {
          return [
            { type: 'info', content: getText('nav_switch_to_dir', 'skills') },
            { type: 'info', content: getText('nav_use_cd', 'skills') }
          ];
        }
        
        return [
          { type: 'info', content: '====== ' + (language === 'zh_TW' ? '技能' : 'Skills') + ' ======' },
          { type: 'success', content: getText('nav_use_ls') },
          { type: 'success', content: getText('nav_example', 'cat frontend.txt') }
        ];
      
      case 'projects':
        if (currentDirectory !== '~/projects') {
          return [
            { type: 'info', content: getText('nav_switch_to_dir', 'projects') },
            { type: 'info', content: getText('nav_use_cd', 'projects') }
          ];
        }
        
        return [
          { type: 'info', content: '====== ' + (language === 'zh_TW' ? '專案列表' : 'Project List') + ' ======' },
          { type: 'success', content: getText('nav_use_ls') },
          { type: 'success', content: getText('nav_example', 'cd terminal-portfolio') }
        ];
      
      case 'contact':
        if (currentDirectory !== '~/contact') {
          return [
            { type: 'info', content: getText('nav_switch_to_dir', 'contact') },
            { type: 'info', content: getText('nav_use_cd', 'contact') }
          ];
        }
        
        return [
          { type: 'info', content: '====== ' + (language === 'zh_TW' ? '聯絡方式' : 'Contact Information') + ' ======' },
          { type: 'success', content: getText('nav_use_ls') },
          { type: 'success', content: getText('nav_example', 'cat info.txt') }
        ];
      
      case 'github':
        return [
          { type: 'info', content: '====== GitHub 資訊 ======' },
          { type: 'success', content: '用戶名: Thetoicxdude' },
          { type: 'success', content: '個人檔案: https://github.com/Thetoicxdude' },
          { type: 'success', content: '儲存庫數量: 11' },
          { type: 'success', content: '成就: Pull Shark' },
          { type: 'success', content: '主要專案:' },
          { type: 'success', content: '- Ai-transformer: AI 模型研究' },
          { type: 'success', content: '- crowdfunding-platform: 眾籌平台' },
          { type: 'success', content: '- Implicit-sentiment-analysis-model: 情感分析' },
          { type: 'success', content: '- Zu-discord-bot: Discord 機器人' },
          { type: 'system', content: '可以使用 "cd .github" 和 "cat profile.txt" 查看更多資訊' }
        ];
        
      case 'theme':
        toggleTheme();
        return [{ type: 'system', content: getText('sys_theme_changed') }];
      
      case 'clear':
        // 清除畫面特殊處理
        setTimeout(() => {
          setOutputHistory([]);
        }, 0);
        return [];
        
      case 'ls':
        // 獲得當前目錄
        const currentDirContent = getCurrentDirectoryContent();
        if (!currentDirContent) {
          return [{ type: 'error', content: `無法獲取目錄內容: ${currentDirectory}` }];
        }
        
        // 檢查 --help 參數
        if (args.includes('--help')) {
          return [
            { type: 'system', content: language === 'zh_TW' ? 'LS(1)                   用戶命令                   LS(1)' : 'LS(1)                 User Commands                 LS(1)' },
            { type: 'system', content: language === 'zh_TW' ? '名稱' : 'NAME' },
            { type: 'success', content: language === 'zh_TW' ? '       ls - 列出目錄內容' : '       ls - list directory contents' },
            { type: 'system', content: language === 'zh_TW' ? '簡介' : 'SYNOPSIS' },
            { type: 'success', content: language === 'zh_TW' ? '       ls [選項]... [檔案]...' : '       ls [OPTION]... [FILE]...' },
            { type: 'system', content: language === 'zh_TW' ? '描述' : 'DESCRIPTION' },
            { type: 'success', content: language === 'zh_TW' ? '       列出指定檔案的資訊（預設為目前的目錄）。' : '       List information about the FILEs (the current directory by default).' },
            { type: 'success', content: language === 'zh_TW' ? '       如果沒有選項，則會以字母順序排列項目。' : '       Sort entries alphabetically if none of -cftuvSUX nor --sort is specified.' },
            { type: 'system', content: language === 'zh_TW' ? '選項' : 'OPTIONS' },
            { type: 'success', content: language === 'zh_TW' ? '       -a, --all' : '       -a, --all' },
            { type: 'success', content: language === 'zh_TW' ? '              不隱藏以 . 開頭的項目' : '              do not ignore entries starting with .' },
            { type: 'success', content: language === 'zh_TW' ? '       -l     使用較長格式列出' : '       -l     use a long listing format' },
            { type: 'info', content: language === 'zh_TW' ? '按 q 離開' : 'Press q to exit' },
          ];
        }
        
        const showHidden = args.includes('-a') || args.includes('-la') || args.includes('-al');
        const showDetails = args.includes('-l') || args.includes('-la') || args.includes('-al');
        
        // 現在確定 currentDirContent 不是 null
        let items = Object.keys(currentDirContent);
        
        // 如果不顯示隱藏檔案，則過濾出隱藏檔案
        if (!showHidden) {
          items = items.filter(item => !item.startsWith('.'));
        }
        
        // 在非完整功能模式下過濾特定資料夾
        if (!isFullFeatured) {
          const hiddenFolders = ['about', 'skills', 'projects', 'contact', '.github'];
          items = items.filter(item => !hiddenFolders.includes(item));
        }
        
        if (items.length === 0) {
          return [{ type: 'success', content: '' }]; // 空目錄
        }
        
        // 對目錄和檔案排序，先顯示目錄，再顯示檔案
        items.sort((a, b) => {
          const aIsDir = currentDirContent[a].type === 'directory';
          const bIsDir = currentDirContent[b].type === 'directory';
          
          if (aIsDir && !bIsDir) return -1;
          if (!aIsDir && bIsDir) return 1;
          return a.localeCompare(b);
        });
        
        const lsResult: React.ReactNode[] = [];
        
        // 如果是詳細列表，每個項目一行
        if (showDetails) {
          for (const item of items) {
            const fsItem = currentDirContent[item];
            lsResult.push(
              <div key={item}>
                <span style={{ color: '#6c71c4' }}>{fsItem.permissions}</span>
                {' '}<span style={{ color: '#859900' }}>{fsItem.owner}</span>
                {' '}<span style={{ color: '#2aa198' }}>{fsItem.group}</span>
                {' '}
                {fsItem.type === 'directory' ? 
                  <DirectoryText>{item}/</DirectoryText> : 
                  <FileText>{item}</FileText>}
              </div>
            );
          }
        } else {
          // 一般列表，項目並排顯示
          for (const item of items) {
            const fsItem = currentDirContent[item];
            lsResult.push(
              <span key={item} style={{ marginRight: '15px' }}>
                {fsItem.type === 'directory' ? 
                  <DirectoryText>{item}/</DirectoryText> : 
                  <FileText>{item}</FileText>}
              </span>
            );
          }
        }
        
        return [{ 
          type: 'success',
          content: lsResult.length > 0 ? <>{lsResult}</> : ''
        }];
        
      case 'pwd':
        let fullPath = currentDirectory;
        if (fullPath === '~') {
          fullPath = `/home/${userName}`;
        } else {
          fullPath = `/home/${userName}${currentDirectory.substring(1)}`;
        }
        return [
          { type: 'success', content: fullPath },
        ];
        
      case 'whoami':
        return [
          { type: 'success', content: isRoot ? 'root' : userName },
        ];
        
      case 'date':
        return [
          { type: 'success', content: new Date().toLocaleString() },
        ];
        
      case 'cd':
        if (args.length === 0) {
          // cd 無參數時返回主目錄
          setCurrentDirectory('~');
          return [];
        }
        
        const target = args[0];
        
        // 在非完整功能模式下限制訪問特定目錄
        if (!isFullFeatured) {
          const restrictedFolders = ['about', 'skills', 'projects', 'contact', '.github'];
          if (restrictedFolders.includes(target)) {
            return [{ type: 'error', content: language === 'zh_TW' ? `cd: ${target}: 沒有此目錄` : `cd: ${target}: No such directory` }];
          }
        }
        
        // 處理 .. 返回上一級目錄
        if (target === '..') {
          if (currentDirectory === '~') {
            return []; // 已經在主目錄，不做任何操作
          }
          
          const parts = currentDirectory.split('/');
          parts.pop(); // 移除最後一部分
          
          if (parts.length === 1 && parts[0] === '~') {
            setCurrentDirectory('~');
          } else {
            setCurrentDirectory(parts.join('/'));
          }
          
          return [];
        }
        
        // 處理 - 返回上一個目錄
        if (target === '-') {
          if (!previousDirectory) {
            return [{ type: 'error', content: language === 'zh_TW' ? 'cd: 沒有先前的目錄' : 'cd: no previous directory' }];
          }
          
          const temp = currentDirectory;
          setCurrentDirectory(previousDirectory);
          setPreviousDirectory(temp);
          
          return [{ type: 'system', content: previousDirectory }];
        }
        
        // 處理絕對路徑
        if (target.startsWith('/')) {
          const newPath = target === '/' ? '~' : `~${target}`;
          const dir = getDirectoryFromPath(newPath);
          
          if (!dir) {
            return [{ type: 'error', content: language === 'zh_TW' ? `cd: ${target}: 沒有此目錄` : `cd: ${target}: No such directory` }];
          }
          
          setPreviousDirectory(currentDirectory);
          setCurrentDirectory(newPath);
          return [];
        }
        
        // 處理相對路徑
        const newPath = currentDirectory === '~' 
          ? `~/${target}` 
          : `${currentDirectory}/${target}`;
        
        const dir = getDirectoryFromPath(newPath);
        
        if (!dir) {
          return [{ type: 'error', content: language === 'zh_TW' ? `cd: ${target}: 沒有此目錄` : `cd: ${target}: No such directory` }];
        }
        
        setPreviousDirectory(currentDirectory);
        setCurrentDirectory(newPath);
        return [];
      
      case 'cat':
        if (args.length === 0) {
          return [{ type: 'error', content: language === 'zh_TW' ? 'cat: 缺少檔案名稱' : 'cat: missing file name' }];
        }
        
        // 在非完整功能模式下檢查是否嘗試訪問限制檔案
        if (!isFullFeatured) {
          // 檢查檔案是否在隱藏目錄中
          if (args[0].includes('/')) {
            const parts = args[0].split('/');
            const firstDir = parts[0];
            const restrictedFolders = ['about', 'skills', 'projects', 'contact', '.github'];
            if (restrictedFolders.includes(firstDir)) {
              return [{ type: 'error', content: language === 'zh_TW' ? `cat: ${args[0]}: 檔案不存在` : `cat: ${args[0]}: No such file` }];
            }
          }
        }
        
        // 特殊處理 PDF 檔案下載
        if (args[0] === 'resume.pdf') {
          // 延遲執行下載進度條顯示
          setTimeout(() => {
            // 模擬下載進度
            let progress = 0;
            const progressInterval = setInterval(() => {
              progress += 10;
              if (progress <= 100) {
                setOutputHistory(prev => {
                  const lastOutput = [...prev];
                  const lastIndex = lastOutput.length - 1;
                  
                  if (lastOutput[lastIndex]) {
                    lastOutput[lastIndex].result = [
                      { type: 'system', content: language === 'zh_TW' ? `正在下載 resume.pdf...` : `Downloading resume.pdf...` },
                      { type: 'system', content: `[${Array(Math.floor(progress/10)).fill('=').join('')}${Array(10-Math.floor(progress/10)).fill(' ').join('')}] ${progress}%` }
                    ];
                  }
                  
                  return lastOutput;
                });
              } else {
                clearInterval(progressInterval);
                
                // 下載完成後顯示成功訊息
                setTimeout(() => {
                  setOutputHistory(prev => {
                    const lastOutput = [...prev];
                    const lastIndex = lastOutput.length - 1;
                    
                    if (lastOutput[lastIndex]) {
                      lastOutput[lastIndex].result = [
                        ...lastOutput[lastIndex].result,
                        { type: 'success', content: language === 'zh_TW' ? `下載完成！檔案已儲存至您的系統。` : `Download complete! File saved to your system.` },
                        { type: 'system', content: language === 'zh_TW' ? `[PDF 文件內容 - 顯示為二進制]` : `[PDF content - displayed as binary]` }
                      ];
                    }
                    
                    return lastOutput;
                  });
                }, 500);
              }
            }, 200); // 每200毫秒更新一次進度
          }, 500);
          
          // 立即返回初始訊息
          return [
            { type: 'system', content: language === 'zh_TW' ? `準備下載 resume.pdf...` : `Preparing to download resume.pdf...` },
            { type: 'system', content: `[          ] 0%` }
          ];
        }
        
        const fileContent = getFileContent(args[0]);
        if (fileContent) {
          return fileContent.map(line => ({ 
            type: 'success' as const, 
            content: line 
          }));
        } else {
          return [{ type: 'error', content: language === 'zh_TW' ? `cat: ${args[0]}: 檔案不存在` : `cat: ${args[0]}: No such file` }];
        }
        
      case 'mkdir':
        return [{ type: 'error', content: 'mkdir: 權限不足，無法建立目錄' }];
        
      case 'find':
        if (args.length === 0) {
          return [{ type: 'error', content: 'find: 缺少路徑和表達式' }];
        }
        
        return [{ type: 'error', content: '目前尚未支援 find 命令的完整功能' }];
        
      case 'man':
        if (args.length === 0) {
          return [{ type: 'error', content: '你必須指定一個手冊頁。' }];
        }
        
        switch (args[0]) {
          case 'ls':
            return [
              { type: 'info', content: 'LS(1)                   用戶命令                   LS(1)' },
              { type: 'system', content: '名稱' },
              { type: 'success', content: '       ls - 列出目錄內容' },
              { type: 'system', content: '簡介' },
              { type: 'success', content: '       ls [選項]... [檔案]...' },
              { type: 'system', content: '描述' },
              { type: 'success', content: '       列出指定檔案的資訊（預設為目前的目錄）。' },
              { type: 'success', content: '       如果沒有選項，則會以字母順序排列項目。' },
              { type: 'system', content: '選項' },
              { type: 'success', content: '       -a, --all' },
              { type: 'success', content: '              不隱藏以 . 開頭的項目' },
              { type: 'success', content: '       -l     使用較長格式列出' },
              { type: 'info', content: '按 q 離開' },
            ];
          case 'cd':
            return [
              { type: 'info', content: language === 'zh_TW' ? 'CD(1)                    用戶命令                   CD(1)' : 'CD(1)                 User Commands                 CD(1)' },
              { type: 'system', content: language === 'zh_TW' ? '名稱' : 'NAME' },
              { type: 'success', content: language === 'zh_TW' ? '       cd - 變更目錄' : '       cd - change directory' },
              { type: 'system', content: language === 'zh_TW' ? '簡介' : 'SYNOPSIS' },
              { type: 'success', content: language === 'zh_TW' ? '       cd [目錄]' : '       cd [directory]' },
              { type: 'system', content: language === 'zh_TW' ? '描述' : 'DESCRIPTION' },
              { type: 'success', content: language === 'zh_TW' ? '       變更當前工作目錄為指定的目錄。' : '       Change the current working directory to the specified directory.' },
              { type: 'success', content: language === 'zh_TW' ? '       預設的目錄是 HOME shell 變數的值。' : '       The default directory is the value of the HOME shell variable.' },
              { type: 'info', content: language === 'zh_TW' ? '按 q 離開' : 'Press q to exit' },
            ];
          default:
            return [{ type: 'error', content: `沒有 ${args[0]} 的手冊頁。` }];
        }
        
      case 'echo':
        if (args.length === 0) {
          return [{ type: 'success', content: '' }];
        }
        return [{ type: 'success', content: args.join(' ') }];
        
      case 'uname':
        if (args.includes('-a')) {
          return [{ type: 'success', content: 'DeviOS 1.0.0 #1 SMP ' + new Date().toLocaleString() + ' x86_64 Personal Website Terminal' }];
        }
        return [{ type: 'success', content: 'DeviOS' }];
        
      case 'exit':
      case 'logout':
        return [
          { type: 'system', content: getText('sys_logout') },
          { type: 'system', content: getText('sys_goodbye') }
        ];
      
      case 'rm':
        // 檢查是否包含危險的參數組合
        if (args.includes('-rf') || args.includes('-fr') || 
            (args.includes('-r') && args.includes('-f')) || 
            (args.includes('-f') && args.includes('-r'))) {
          return rickRoll();
        }
        return [{ type: 'error', content: `rm: 危險操作已被系統攔截，請小心使用刪除命令！` }];
      
      case 'sudo':
        if (args.length === 0) {
          return [{ type: 'error', content: 'sudo: 缺少要執行的命令' }];
        }
        
        // 儲存要執行的命令並激活密碼提示
        setSudoCommand(args.join(' '));
        setIsSudoPrompt(true);
        
        return [{ type: 'system', content: `[sudo] ${userName} 的密碼:` }];
      
      case 'id':
        return [
          { type: 'success', content: `uid=${isRoot ? 0 : 1000}(${isRoot ? 'root' : userName}) gid=1000(${groups[0]}) 群組=${groups.join(',')}` },
        ];
      
      case 'chmod':
        if (args.length < 2) {
          return [{ type: 'error', content: 'chmod: 缺少操作數' }];
        }
        
        const mode = args[0];
        const targetPath = args[1];
        
        // 獲取目標檔案或目錄
        const chmodTarget = getFileSystemItem(targetPath);
        if (!chmodTarget) {
          return [{ type: 'error', content: `chmod: ${targetPath}: 檔案不存在` }];
        }
        
        // 檢查是否有權限更改
        if (!isRoot && chmodTarget.owner !== userName) {
          return [{ type: 'error', content: `chmod: ${targetPath}: 權限不足` }];
        }
        
        // 這裡可以加入更改權限的實際邏輯，但為簡化我們只返回成功訊息
        return [{ type: 'success', content: `已更改 '${targetPath}' 的權限` }];
      
      case 'chown':
        if (args.length < 2) {
          return [{ type: 'error', content: 'chown: 缺少操作數' }];
        }
        
        const owner = args[0];
        const chownPath = args[1];
        
        // 只有 root 可以更改所有權
        if (!isRoot) {
          return [{ type: 'error', content: 'chown: 需要系統管理員權限' }];
        }
        
        // 獲取目標檔案或目錄
        const chownTarget = getFileSystemItem(chownPath);
        if (!chownTarget) {
          return [{ type: 'error', content: `chown: ${chownPath}: 檔案不存在` }];
        }
        
        // 這裡可以加入更改所有權的實際邏輯，但為簡化我們只返回成功訊息
        return [{ type: 'success', content: `已更改 '${chownPath}' 的所有者為 '${owner}'` }];
      
      case 'touch':
        if (args.length < 1) {
          return [{ type: 'error', content: 'touch: 缺少檔案操作數' }];
        }
        
        const touchPath = args[0];
        const touchDir = getCurrentDirectoryContent();
        
        if (!touchDir) {
          return [{ type: 'error', content: `touch: 無法存取 '${currentDirectory}'` }];
        }
        
        // 檢查是否有寫入權限
        if (!isRoot && !checkPermission(getDirectoryFromPath(currentDirectory) as DirectoryItem, 'write')) {
          return [{ type: 'error', content: `touch: ${touchPath}: 權限不足` }];
        }
        
        // 這裡可以加入創建檔案的實際邏輯，但為簡化我們只返回成功訊息
        return [{ type: 'success', content: `已創建 '${touchPath}'` }];
      
      case 'mkdir':
        if (args.length < 1) {
          return [{ type: 'error', content: 'mkdir: 缺少目錄操作數' }];
        }
        
        const mkdirPath = args[0];
        const parentDir = getCurrentDirectoryContent();
        
        if (!parentDir) {
          return [{ type: 'error', content: `mkdir: 無法存取 '${currentDirectory}'` }];
        }
        
        // 檢查是否有寫入權限
        if (!isRoot && !checkPermission(getDirectoryFromPath(currentDirectory) as DirectoryItem, 'write')) {
          return [{ type: 'error', content: `mkdir: 無法建立目錄 '${mkdirPath}': 權限不足` }];
        }
        
        // 這裡可以加入創建目錄的實際邏輯，但為簡化我們只返回成功訊息
        return [{ type: 'success', content: `已創建目錄 '${mkdirPath}'` }];
      
      case 'lang':
        if (args.length === 0) {
          return [
            { type: 'info', content: language === 'zh_TW' ? '目前語言：繁體中文' : 'Current language: English' },
            { type: 'info', content: language === 'zh_TW' ? '用法: lang [zh|en]' : 'Usage: lang [zh|en]' }
          ];
        }
        
        switch (args[0].toLowerCase()) {
          case 'en':
            setLanguage('en_US');
            // 清除所有歷史輸出，確保介面立即反映語言變更
            setTimeout(() => {
              setOutputHistory([{
                command: '',
                result: [
                  { type: 'system', content: 'Language changed to English' },
                  { type: 'info', content: 'Type "help" to see available commands.' }
                ]
              }]);
            }, 0);
            return [{ type: 'system', content: 'Language changed to English' }];
            
          case 'zh':
            setLanguage('zh_TW');
            // 清除所有歷史輸出，確保介面立即反映語言變更
            setTimeout(() => {
              setOutputHistory([{
                command: '',
                result: [
                  { type: 'system', content: '語言已切換為中文' },
                  { type: 'info', content: '輸入 "help" 查看可用命令' }
                ]
              }]);
            }, 0);
            return [{ type: 'system', content: '語言已切換為中文' }];
            
          default:
            return [
              { type: 'error', content: language === 'zh_TW' ? `無效的選項 -- '${args[0]}'` : `Invalid option -- '${args[0]}'` },
              { type: 'info', content: language === 'zh_TW' ? '用法: lang [zh|en]' : 'Usage: lang [zh|en]' }
            ];
        }
      
      default:
        // 檢查是否輸入了帶有參數的命令 (如果輸入了未知命令)
        if (cmd.includes('-')) {
          return [{ type: 'error', content: `${command}: ${getText('err_invalid_option')} -- '${args.join(' ')}'` }];
        }
        return [{ type: 'error', content: `${command}: ${getText('err_cmd_not_found')}` }];
    }
  };
  
  // 構建提示符
  const getPrompt = () => {
    const user = isRoot ? 'root' : userName;
    // 修改提示符以反映當前語言和root狀態
    if (language === 'en_US') {
      return `${user}@${hostName}:${currentDirectory}$`;
    } else {
      return `${user}@${hostName}:${currentDirectory}$`;
    }
  };
  
  // 點擊終端任意位置時，聚焦輸入框
  const handleTerminalClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
      // 更新光標位置
      setCursorPosition(updateCursorFromSelection(inputRef.current));
    }
  };

  // 添加一個新的處理函數用於處理輸入框的點擊
  const handleInputClick = (e: React.MouseEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    setCursorPosition(updateCursorFromSelection(input));
    e.stopPropagation(); // 防止事件冒泡到TerminalWrapper
  };

  // 添加用於處理鼠標選擇的事件
  const handleInputSelect = (e: React.SyntheticEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    setCursorPosition(updateCursorFromSelection(input));
  };

  // 新增一個函數，根據輸入框的選擇範圍更新光標位置
  const updateCursorFromSelection = (input: HTMLInputElement) => {
    if (input) {
      return input.selectionStart || 0;
    }
    return 0;
  };

  const rickRoll = (): CommandResult[] => {
    // 模擬進度輸出的函數
    const addProgressMessage = (percent: number, currentPath: string) => {
      setOutputHistory(prev => {
        const lastOutput = [...prev];
        const lastIndex = lastOutput.length - 1;
        
        if (lastOutput[lastIndex]) {
          lastOutput[lastIndex].result = [
            ...lastOutput[lastIndex].result,
            { type: 'system', content: `已處理 ${percent}%: ${currentPath}` }
          ];
        }
        
        return lastOutput;
      });
    };
    
    // 先返回第一條訊息
    setTimeout(() => {
      // 模擬進度條報告
      const paths = [
        '/home/deviser/Documents',
        '/home/deviser/Pictures',
        '/home/deviser/Downloads',
        '/home/deviser/.config',
        '/home/deviser/.local/share',
        '/var/log',
        '/etc/apt'
      ];
      
      let i = 0;
      const progressInterval = setInterval(() => {
        if (i < paths.length) {
          const percent = Math.floor((i / paths.length) * 100);
          addProgressMessage(percent, paths[i]);
          i++;
        } else {
          clearInterval(progressInterval);
          
          // 顯示權限錯誤信息
          setTimeout(() => {
            setOutputHistory(prev => {
              const lastOutput = [...prev];
              const lastIndex = lastOutput.length - 1;
              
              if (lastOutput[lastIndex]) {
                lastOutput[lastIndex].result = [
                  ...lastOutput[lastIndex].result,
                  { type: 'error', content: `rm: 無法刪除 '/var/lib/dpkg': 權限不足` },
                  { type: 'error', content: `rm: 無法移除 '/etc/passwd': 操作不允許` },
                  { type: 'error', content: `rm: 無法刪除 '/boot': 設備或資源忙碌中` }
                ];
              }
              
              return lastOutput;
            });
            
            // 延遲顯示第二條訊息
            setTimeout(() => {
              setOutputHistory(prev => {
                const lastOutput = [...prev];
                const lastIndex = lastOutput.length - 1;
                
                if (lastOutput[lastIndex]) {
                  // 添加檔案刪除數量訊息，並包含一些細節
                  lastOutput[lastIndex].result = [
                    ...lastOutput[lastIndex].result,
                    { type: 'system', content: `已刪除 784 個檔案 (佔用 1.2GB)` }
                  ];
                }
                
                return lastOutput;
              });
              
              // 延遲顯示第三條訊息
              setTimeout(() => {
                setOutputHistory(prev => {
                  const lastOutput = [...prev];
                  const lastIndex = lastOutput.length - 1;
                  
                  if (lastOutput[lastIndex]) {
                    // 添加目錄刪除數量訊息
                    lastOutput[lastIndex].result = [
                      ...lastOutput[lastIndex].result,
                      { type: 'system', content: `已刪除 46 個目錄` }
                    ];
                  }
                  
                  return lastOutput;
                });
                
                // 延遲顯示完成訊息和總結
                setTimeout(() => {
                  setOutputHistory(prev => {
                    const lastOutput = [...prev];
                    const lastIndex = lastOutput.length - 1;
                    
                    if (lastOutput[lastIndex]) {
                      // 添加操作完成訊息，包含一些計時資訊
                      lastOutput[lastIndex].result = [
                        ...lastOutput[lastIndex].result,
                        { type: 'success', content: `操作已完成，用時 5.72 秒` },
                        { type: 'system', content: `已跳過 3 個無法訪問的檔案` }
                      ];
                    }
                    
                    return lastOutput;
                  });
                  
                  // 等待較長時間，讓使用者確信真的刪除了，然後才顯示警告
                  setTimeout(() => {
                    // 短暫延遲後顯示Rick Roll警告
                    setOutputHistory(prev => {
                      const lastOutput = [...prev];
                      const lastIndex = lastOutput.length - 1;
                      
                      // 添加警告訊息，模擬系統日誌風格
                      if (lastOutput[lastIndex]) {
                        const now = new Date();
                        const timeStr = now.toISOString().replace('T', ' ').substr(0, 19);
                        
                        lastOutput[lastIndex].result = [
                          ...lastOutput[lastIndex].result,
                          { type: 'system', content: '-------------------------------' },
                          { type: 'system', content: `[${timeStr}] kernel: [警告] 檢測到潛在的系統破壞嘗試` },
                          { type: 'error', content: '警告: 系統檢測到危險操作！' },
                          { type: 'warning', content: 'systemd-guard[1234]: 防護機制已啟動，進程ID 5678' },
                          { type: 'system', content: `[${timeStr}] kernel: 正在還原系統檔案...` },
                          { type: 'error', content: 'systemd[1]: 錯誤：已阻止刪除系統關鍵檔案' },
                          { type: 'system', content: 'bash: 正在載入防護措施...' },
                          { type: 'warning', content: '安全模組啟動：你已被 Rick Roll 了！' }
                        ];
                      }
                      
                      return lastOutput;
                    });
                    
                    // 啟動Rick Roll顯示
                    setTimeout(() => {
                      setIsRickRolling(true);
                      
                      // 15秒後恢復
                      setTimeout(() => {
                        setIsRickRolling(false);
                        
                        // 恢復後顯示調侃訊息，模擬系統恢復消息
                        setOutputHistory(prev => [
                          ...prev, 
                          { 
                            command: '', 
                            result: [
                              { type: 'system', content: `[防護系統] ${userName}@${hostName}: 快照還原完成。` },
                              { type: 'info', content: '所有檔案已從時間點 ' + new Date().toLocaleString() + ' 還原。' },
                              { type: 'warning', content: '下次請小心使用危險命令！系統管理員已被通知。' },
                              { type: 'success', content: '防護模組：哈哈，你的檔案沒有真的被刪除。感謝使用 DeviOS 安全防護！' }
                            ] 
                          }
                        ]);
                      }, 12000);
                    }, 2000);
                  }, 4000);
                }, 1500);
              }, 1500);
            }, 1500);
          }, 1000);
        }
      }, 400); // 每400毫秒更新一次進度
    }, 1000);
    
    // 立即返回第一條訊息，包含一些Linux風格的提示
    return [
      { type: 'system', content: `[${userName}@${hostName} ${currentDirectory}]# rm -rf /*` }, // 顯示執行的完整命令
      { type: 'success', content: `正在刪除檔案...請稍候` }
    ];
  };

  // 檢查用戶是否對目標有權限
  const checkPermission = (item: FileSystemItem, type: 'read' | 'write' | 'execute'): boolean => {
    if (isRoot) return true; // 管理員擁有所有權限
    
    const isOwner = item.owner === userName;
    const isInGroup = groups.includes(item.group);
    
    let permIndex = -1;
    if (type === 'read') {
      permIndex = isOwner ? 0 : (isInGroup ? 3 : 6);
    } else if (type === 'write') {
      permIndex = isOwner ? 1 : (isInGroup ? 4 : 7);
    } else if (type === 'execute') {
      permIndex = isOwner ? 2 : (isInGroup ? 5 : 8);
    }
    
    return item.permissions[permIndex] !== '-';
  };

  // 從路徑獲取檔案系統項目
  const getFileSystemItem = (filePath: string): FileSystemItem | null => {
    const isAbsolutePath = filePath.startsWith('/');
    const normalizedPath = isAbsolutePath 
      ? filePath.substring(1)
      : (currentDirectory === '~' 
        ? filePath 
        : `${currentDirectory.substring(2)}/${filePath}`);
    
    const parts = normalizedPath.split('/').filter(p => p);
    
    let current: any = fileSystem;
    if (normalizedPath.startsWith('~')) {
      current = fileSystem['~'];
      parts.shift(); // 移除 ~ 
    }
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        return current.content[part] || null;
      }
      
      if (current.content[part] && current.content[part].type === 'directory') {
        current = current.content[part];
      } else {
        return null;
      }
    }
    
    return current;
  };

  // 從路徑獲取目錄
  const getDirectoryFromPath = (dirPath: string): DirectoryItem | null => {
    if (dirPath === '~') return fileSystem['~'] as DirectoryItem;
    
    const parts = dirPath.split('/').filter(p => p);
    let current: any = fileSystem;
    
    if (dirPath.startsWith('~')) {
      current = fileSystem['~'];
      parts.shift(); // 移除 ~
    }
    
    for (const part of parts) {
      if (current.content[part] && current.content[part].type === 'directory') {
        current = current.content[part];
      } else {
        return null;
      }
    }
    
    return current;
  };

  return (
    <TerminalWrapper onClick={handleTerminalClick}>
      <TerminalOutput ref={outputRef}>
        {isBooting ? (
          <div style={{ fontFamily: 'monospace' }}>
            {/* 渲染啟動頭部 */}
            {bootHeader.slice(0, Math.min(bootStage, bootHeader.length)).map((line, i) => (
              <SystemMessage key={`header-${i}`} style={{ color: '#aaa', fontSize: '14px' }}>{line}</SystemMessage>
            ))}
            
            {/* 渲染 ASCII Art 名字 */}
            {bootStage > bootHeader.length && 
              asciiName.slice(0, Math.min(bootStage - bootHeader.length, asciiName.length)).map((line, i) => (
                <SystemMessage key={`ascii-${i}`} style={{ color: '#0f0', fontSize: '16px' }}>{line}</SystemMessage>
              ))
            }
            
            {/* 渲染啟動消息 */}
            {bootStage > (bootHeader.length + asciiName.length) && 
              bootMessages.slice(0, bootStage - bootHeader.length - asciiName.length).map((boot: {msg: {[key: string]: string} | string, delay: number}, i: number) => (
                <SystemMessage key={`boot-${i}`} style={{ color: '#0af' }}>
                  {language === 'zh_TW' ? '[啟動]' : '[Boot]'} {typeof boot.msg === 'string' ? boot.msg : boot.msg[language]}
                </SystemMessage>
              ))
            }
          </div>
        ) : (
          <CommandHistory>
            {outputHistory.map((item, index) => (
              <div key={index}>
                {/* 無論是否有命令都顯示提示符，僅在有命令時顯示命令內容 */}
                <CommandPrompt>
                  <Prompt>{getPrompt()}</Prompt>
                  {item.command && <span>{item.command}</span>}
                </CommandPrompt>
                {item.result.map((res, resultIndex) => {
                  switch (res.type) {
                    case 'error':
                      return <ErrorMessage key={resultIndex}>{res.content}</ErrorMessage>;
                    case 'success':
                      return <SuccessMessage key={resultIndex}>{res.content}</SuccessMessage>;
                    case 'info':
                      return <InfoMessage key={resultIndex}>{res.content}</InfoMessage>;
                    case 'warning':
                      return <WarningMessage key={resultIndex}>{res.content}</WarningMessage>;
                    case 'system':
                      return <SystemMessage key={resultIndex}>{res.content}</SystemMessage>;
                    default:
                      return <ResultLine key={resultIndex}>{res.content}</ResultLine>;
                  }
                })}
              </div>
            ))}
          </CommandHistory>
        )}
      </TerminalOutput>
      
      {/* 顯示Rick Roll視頻，但保持在終端之外作為覆蓋層 */}
      {isRickRolling && (
        <RickRollContainer>
          <RickRollVideo>
            <iframe
              src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&mute=0&controls=0&showinfo=0&rel=0&loop=1"
              title="Rick Roll Video"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          </RickRollVideo>
          
          {/* 只顯示ASCII藝術，沒有歌詞 */}
          <div style={{ marginTop: '20px' }}>
            {rickRollArt.slice(-7).map((line, i) => (
              <RickRollArt key={`rickart-${i}`}>{line}</RickRollArt>
            ))}
          </div>
        </RickRollContainer>
      )}
      
      {!isBooting && !isRickRolling && (
        <form onSubmit={handleCommandSubmit}>
          <CommandPrompt>
            <Prompt>{getPrompt()}</Prompt>
            <InputWrapper>
              <Input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
                autoComplete="off"
                spellCheck="false"
                onClick={handleInputClick}
                onSelect={handleInputSelect}
              />
              <Cursor position={cursorPosition} />
            </InputWrapper>
          </CommandPrompt>
        </form>
      )}
    </TerminalWrapper>
  );
};

export default Terminal; 