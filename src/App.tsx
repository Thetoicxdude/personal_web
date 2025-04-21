import { useState, useEffect } from 'react'
import styled, { ThemeProvider } from 'styled-components'
import Terminal from './components/Terminal'
import { lightTheme, darkTheme, GlobalStyles } from './themes'
import './App.css'

const AppContainer = styled.div`
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  box-sizing: border-box;
`

const TerminalContainer = styled.div`
  width: 100%;
  max-width: 900px;
  height: 600px;
  background-color: ${props => props.theme.background};
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  overflow: hidden;
`

function App() {
  const [theme, setTheme] = useState('dark')
  
  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light')
  }
  
  return (
    <ThemeProvider theme={theme === 'light' ? lightTheme : darkTheme}>
      <GlobalStyles />
      <AppContainer>
        <TerminalContainer>
          <Terminal toggleTheme={toggleTheme} />
        </TerminalContainer>
      </AppContainer>
    </ThemeProvider>
  )
}

export default App
