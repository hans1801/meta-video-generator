import styled, { css } from 'styled-components';

export const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

export const FieldLabel = styled.label`
  font-size: 11px;
  font-weight: 500;
  color: #8888a8;
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

export const OptionalSpan = styled.span`
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: #55556a;
`;

export const Textarea = styled.textarea`
  background: #17171f;
  border: 1px solid #2a2a3a;
  border-radius: 10px;
  color: #e8e8f0;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  outline: none;
  padding: 10px 12px;
  resize: vertical;
  transition: border-color 0.15s;
  width: 100%;

  &::placeholder {
    color: #444456;
  }
  &:focus {
    border-color: #4f46e5;
  }
`;

export const Dropzone = styled.div<{ $dragging?: boolean; $hasImage?: boolean }>`
  background: #17171f;
  border: 1.5px dashed #2a2a3a;
  border-radius: 10px;
  cursor: pointer;
  min-height: 90px;
  transition:
    border-color 0.15s,
    background 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: #1d1d28;
    border-color: #4f46e5;
    border-style: solid;
  }

  ${({ $dragging }) =>
    $dragging &&
    css`
      background: #1d1d28;
      border-color: #4f46e5;
      border-style: solid;
    `}
`;

export const DropzoneHint = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: #4a4a62;
  padding: 16px;

  span {
    font-size: 13px;
    color: #666688;
  }
  small {
    font-size: 11px;
    color: #3a3a52;
  }
`;

export const ImagePreview = styled.div`
  position: relative;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px;

  img {
    max-height: 120px;
    max-width: 100%;
    border-radius: 6px;
    object-fit: contain;
  }
`;

export const ImageName = styled.span`
  font-size: 11px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #666680;
`;

export const RemoveBtn = styled.button`
  position: absolute;
  top: 6px;
  right: 6px;
  background: #2a2a3a;
  border: none;
  border-radius: 50%;
  color: #aaaacc;
  cursor: pointer;
  font-size: 16px;
  height: 22px;
  width: 22px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;

  &:hover {
    background: #3a3a50;
    color: #e8e8f0;
  }
`;

export const HiddenInput = styled.input`
  display: none;
`;
