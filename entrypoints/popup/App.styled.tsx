import styled, { createGlobalStyle, keyframes, css } from 'styled-components';

export const GlobalStyle = createGlobalStyle`
  * { box-sizing: border-box; margin: 0; padding: 0; }
`;

export const AppContainer = styled.div`
  width: 380px;
  background: #0f0f13;
  color: #e8e8f0;
  font-family: Inter, system-ui, sans-serif;
  font-size: 14px;
  min-height: 100vh;
`;

export const Header = styled.header`
  padding: 12px 16px;
  border-bottom: 1px solid #1e1e2e;
  background: #0c0c10;
`;

export const HeaderTop = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

export const HeaderLogo = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  color: #c8c8e0;
  flex-shrink: 0;
`;

export const ModeTabs = styled.div`
  display: flex;
  background: #17171f;
  border-radius: 8px;
  padding: 2px;
  gap: 2px;
`;

export const ModeTab = styled.button<{ $active?: boolean }>`
  background: none;
  border: none;
  border-radius: 6px;
  color: #55556a;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  padding: 5px 10px;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;

  &:hover { color: #9090b0; }

  ${({ $active }) => $active && css`
    background: #2a2a3e;
    color: #c8c8f0;
  `}
`;

export const Main = styled.main`
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

export const Footer = styled.footer`
  text-align: center;
  font-size: 10px;
  color: #35354a;
  padding-bottom: 8px;
`;

export const GenerateBtn = styled.button`
  align-items: center;
  background: linear-gradient(135deg, #4f46e5, #3b82f6);
  border: none;
  border-radius: 10px;
  color: white;
  cursor: pointer;
  display: flex;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  gap: 8px;
  justify-content: center;
  padding: 11px 16px;
  transition: filter 0.15s, transform 0.1s;
  width: 100%;

  &:hover:not(:disabled) { filter: brightness(1.1); }
  &:active:not(:disabled) { transform: scale(0.98); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

export const AbortBtn = styled.button`
  background: #2a1a1a;
  border: 1px solid #4a2020;
  border-radius: 10px;
  color: #f08090;
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  padding: 11px 16px;
  width: 100%;
  transition: background 0.15s;

  &:hover { background: #381e1e; }
`;

const spin = keyframes`to { transform: rotate(360deg); }`;

export const Spinner = styled.span`
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: ${spin} 0.7s linear infinite;
  flex-shrink: 0;
`;

export const StatusMessage = styled.div<{ $type: 'error' | 'success' | 'loading' | 'idle' }>`
  border-radius: 8px;
  font-size: 12px;
  padding: 9px 12px;
  line-height: 1.4;

  ${({ $type }) => $type === 'error' && css`
    background: #2a1020; border: 1px solid #4a1a30; color: #f08090;
  `}
  ${({ $type }) => $type === 'success' && css`
    background: #102a18; border: 1px solid #1a4a28; color: #60d080;
  `}
  ${({ $type }) => $type === 'loading' && css`
    background: #10152a; border: 1px solid #1a2050; color: #8090e0;
  `}
`;
