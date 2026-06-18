import styled, { css } from 'styled-components';
import { SceneStatuses } from '../../../lib/types';
import type { SceneStatus } from '../../../lib/types';

export const ProjectHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
`;

export const ProjectInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
`;

export const ProjectTitle = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: #d8d8f0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const ProjectCount = styled.span`
  font-size: 11px;
  color: #55556a;
`;

export const ProgressBarWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

export const ProgressBarTrack = styled.div`
  flex: 1;
  height: 5px;
  background: #1e1e2e;
  border-radius: 99px;
  overflow: hidden;
`;

export const ProgressBarFill = styled.div<{ $pct: number }>`
  height: 100%;
  background: linear-gradient(90deg, #4f46e5, #3b82f6);
  border-radius: 99px;
  transition: width 0.4s ease;
  width: ${({ $pct }) => $pct}%;
`;

export const ProgressLabel = styled.span`
  font-size: 11px;
  color: #55556a;
  flex-shrink: 0;
  min-width: 30px;
  text-align: right;
`;

export const SceneGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`;

export const SceneCell = styled.div<{ $status?: SceneStatus }>`
  width: 22px;
  height: 22px;
  font-size: 11px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  border: 1px solid transparent;

  ${({ $status }) =>
    !$status &&
    css`
      background: #1e1e2e;
      color: #55556a;
      border-color: #2a2a3a;
    `}
  ${({ $status }) =>
    $status === SceneStatuses.Processing &&
    css`
      background: #2a2a10;
      color: #e0c060;
      border-color: #3a3a10;
    `}
  ${({ $status }) =>
    $status === SceneStatuses.Done &&
    css`
      background: #1a4028;
      color: #60d080;
      border-color: #1a5035;
    `}
  ${({ $status }) =>
    $status === SceneStatuses.Error &&
    css`
      background: #3a1020;
      color: #f08090;
      border-color: #4a1a30;
    `}
`;

export const FolderSelectBtn = styled.button`
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #2a2a3a;
  cursor: pointer;
  background: #17171f;
  text-align: left;
  font-size: 13px;
  font-family: inherit;
  color: #c8c8e0;
  width: 100%;
  transition: background 0.15s;

  &:hover:not(:disabled) {
    background: #1d1d28;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const ScenesCount = styled.div`
  font-size: 12px;
  color: #8888a8;
`;

export const LastBatchDivider = styled.div`
  border-top: 1px solid #1e1e2e;
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const LastBatchLabel = styled.div`
  font-size: 11px;
  color: #55556a;
`;

export const BatchNote = styled.p`
  font-size: 11px;
  color: #55556a;
  line-height: 1.4;
`;
