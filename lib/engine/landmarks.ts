// 자주 쓰는 관절 번호 (MediaPipe 33개 관절 중. left/right는 선수 본인 기준)
// MediaPipe 도구 자체를 불러오지 않아도 쓸 수 있도록 따로 둔다 (계산·테스트용).

export const LANDMARK = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftPinky: 17,
  rightPinky: 18,
  leftIndex: 19,
  rightIndex: 20,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFootIndex: 31,
  rightFootIndex: 32,
} as const;

/** MediaPipe 관절 개수 */
export const LANDMARK_COUNT = 33;
