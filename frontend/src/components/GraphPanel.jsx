import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { useStore } from "../store";

const NODE_COLOR = "#5DCAA5";
const HIGHLIGHT_COLOR = "#EF9F27";
const EDGE_COLOR = "#444444";
const LABEL_COLOR = "#b8b8b8";

function pulseNode(circle) {
  const repeat = () => {
    circle
      .transition()
      .duration(500)
      .attr("r", 12)
      .attr("fill", HIGHLIGHT_COLOR)
      .transition()
      .duration(500)
      .attr("r", 6)
      .on("end", repeat);
  };
  repeat();
}

export default function GraphPanel() {
  const svgRef = useRef(null);
  const graphData = useStore((s) => s.graphData);
  const activeNodes = useStore((s) => s.activeNodes);
  const setSelectedFile = useStore((s) => s.setSelectedFile);
  const pulseTimersRef = useRef([]);

  useEffect(() => {
    if (!svgRef.current) return;

    const width = svgRef.current.clientWidth || 640;
    const height = svgRef.current.clientHeight || 480;

    const nodes = (graphData?.nodes || []).map((node) => ({ ...node }));
    const links = (graphData?.edges || []).map((edge) => ({
      source: edge.from,
      target: edge.to,
    }));

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", [0, 0, width, height]);

    const simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink(links)
          .id((d) => d.id)
          .distance(100),
      )
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const link = svg
      .append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", EDGE_COLOR)
      .attr("stroke-width", 1.2);

    const nodeGroup = svg
      .append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "pointer")
      .on("click", (_, node) => setSelectedFile(node.id));

    const circles = nodeGroup
      .append("circle")
      .attr("r", 6)
      .attr("fill", NODE_COLOR)
      .attr("data-node-id", (d) => d.id);

    nodeGroup
      .append("text")
      .text((d) => d.label)
      .attr("x", 10)
      .attr("y", 4)
      .attr("fill", LABEL_COLOR)
      .attr("font-size", 10)
      .style("pointer-events", "none");

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);

      nodeGroup.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return () => simulation.stop();
  }, [graphData, setSelectedFile]);

  useEffect(() => {
    if (!svgRef.current || !activeNodes.length) return;

    const svg = d3.select(svgRef.current);
    pulseTimersRef.current.forEach(clearTimeout);
    pulseTimersRef.current = [];

    activeNodes.forEach((nodeId) => {
      const circle = svg.select(`circle[data-node-id="${CSS.escape(nodeId)}"]`);
      if (circle.empty()) return;

      circle.interrupt();
      pulseNode(circle);

      const timer = setTimeout(() => {
        circle.interrupt();
        circle.attr("r", 6).attr("fill", NODE_COLOR);
      }, 3000);
      pulseTimersRef.current.push(timer);
    });

    return () => {
      pulseTimersRef.current.forEach(clearTimeout);
      pulseTimersRef.current = [];
    };
  }, [activeNodes]);

  return <svg ref={svgRef} className="block h-full w-full" />;
}
