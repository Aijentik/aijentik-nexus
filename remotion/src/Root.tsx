import React from "react";
import { Composition } from "remotion";
import { AijentikAd } from "./AijentikAd";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="aijentik-final-ad"
      component={AijentikAd}
      durationInFrames={1290}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
