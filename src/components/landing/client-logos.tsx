"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useMediaQuery } from "./use-media-query";

const businesses = [
  {
    file: "jacita-travels.png",
    name: "JACITA Travels",
    width: 2000,
    height: 2000,
    variant: "wide-logo",
  },
  {
    file: "pcl.png",
    name: "PCL",
    width: 1080,
    height: 1350,
    variant: "pcl-logo",
  },
  {
    file: "jacita-logistics.png",
    name: "JACITA Logistics",
    width: 2000,
    height: 2000,
    variant: "wide-logo",
  },
  {
    file: "all-hair-beauty.jpeg",
    name: "All Hair & Beauty Salon",
    width: 1254,
    height: 1254,
    variant: "salon-logo",
  },
];

export function ClientLogos() {
  const [index, setIndex] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)", true);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || reducedMotion) return;
    let visible = false;
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    observer.observe(grid);
    const timer = window.setInterval(() => {
      if (visible && !document.hidden && !grid.matches(":hover"))
        setIndex((value) => value + 1);
    }, 5200);
    return () => {
      observer.disconnect();
      clearInterval(timer);
    };
  }, [reducedMotion]);
  return (
    <div className="logo-grid" aria-label="Endorsed businesses" ref={gridRef}>
      {businesses.map((business, order) => (
        <div className="logo-cell" key={business.file}>
          <div className="business-logo-frame">
            <Image
              key={index}
              src={"/landing/business-logos/" + business.file}
              alt={business.name}
              width={business.width}
              height={business.height}
              sizes="(max-width:650px) 40vw, 260px"
              className={"logo-mark business-logo " + business.variant}
              style={{ animationDelay: order * 0.12 + "s" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
