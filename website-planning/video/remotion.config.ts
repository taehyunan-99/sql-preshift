// Remotion 설정 — studio/render 공통. 영상은 무음 hero loop이라 오디오 비활성.
import { Config } from '@remotion/cli/config';

// 중간 프레임을 PNG(무손실)로 — JPEG는 다크 그라데이션/glow에 블록 노이즈를 남긴다.
Config.setVideoImageFormat('png');
Config.setOverwriteOutput(true);
Config.setCodec('h264');
// CRF를 매우 낮게 — 다크 신의 banding 최소화(낮을수록 고품질·큰 용량). hero라 화질 우선.
Config.setCrf(12);
// yuv420p 유지 — 웹/Safari 호환.
Config.setPixelFormat('yuv420p');
