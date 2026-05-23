import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { useStore } from "../store";

const NODE_COLOR = "#63d7b5";
const SELECTED_COLOR = "#38bdf8";
const HIGHLIGHT_COLOR = "#f4b740";
const EDGE_COLOR = "#2f3a46";
const LABEL_COLOR = "#cbd5e1";
const LARGE_GRAPH_LABEL_LIMIT = 300;

function pulseNode(circle) {
  const repeat = () => {
    circle
      .transition()
      .duration(500)
      .attr("r", 12)
      .attr("fill", HIGHLIGHT_COLOR)
      .transition()
      .duration(500)
      .attr("r", 5)
      .on("end", repeat);
  };
  repeat();
}

export default function GraphPanel() {
  const svgRef = useRef(null);
  const graphData = useStore((s) => s.graphData);
  const activeNodes = useStore((s) => s.activeNodes);
  const selectedFile = useStore((s) => s.selectedFile);
  const setSelectedFile = useStore((s) => s.setSelectedFile);
  const pulseTimersRef = useRef([]);

  const totalNodes = graphData?.nodes?.length || 0;
  const totalEdges = graphData?.edges?.length || 0;

  useEffect(() => {
    if (!svgRef.current) return;

    const width = svgRef.current.clientWidth || 640;
    const height = svgRef.current.clientHeight || 480;
    const nodes = (graphData?.nodes || []).map((node) => ({ ...node }));
    const nodeIds = new Set(nodes.map((node) => node.id));
    const links = (graphData?.edges || [])
      .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
      .map((edge) => ({
        source: edge.from,
        target: edge.to,
      }));
    const showLabels = nodes.length <= LARGE_GRAPH_LABEL_LIMIT;
    const radius = nodes.length > 1000 ? 3.5 : 5;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", [0, 0, width, height]);

    if (!nodes.length) return;

    const viewport = svg.append("g");
    svg.call(
      d3
        .zoom()
        .scaleExtent([0.25, 5])
        .on("zoom", (event) => {
          viewport.attr("transform", event.transform);
        }),
    );

    const simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink(links)
          .id((d) => d.id)
          .distance(nodes.length > 1000 ? 42 : 90)
          .strength(0.45),
      )
      .force("charge", d3.forceManyBody().strength(nodes.length > 1000 ? -18 : -120))
      .force("collide", d3.forceCollide(radius + 2))
      .force("x", d3.forceX(width / 2).strength(0.04))
      .force("y", d3.forceY(height / 2).strength(0.04))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const link = viewport
      .append("g")
      .attr("opacity", 0.5)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", EDGE_COLOR)
      .attr("stroke-width", 1);

    const nodeGroup = viewport
      .append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "pointer")
      .on("click", (_, node) => setSelectedFile(node.id));

    nodeGroup.append("title").text((d) => d.id);

    nodeGroup
      .append("circle")
      .attr("r", radius)
      .attr("fill", (d) => (d.id === selectedFile ? SELECTED_COLOR : NODE_COLOR))
      .attr("stroke", "#0f172a")
      .attr("stroke-width", 1.5)
      .attr("data-node-id", (d) => d.id);

    if (showLabels) {
      nodeGroup
        .append("text")
        .text((d) => d.label)
        .attr("x", radius + 5)
        .attr("y", 4)
        .attr("fill", LABEL_COLOR)
        .attr("font-size", 10)
        .style("pointer-events", "none");
    }

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);

      nodeGroup.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return () => simulation.stop();
  }, [graphData, selectedFile, setSelectedFile]);

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
        circle
          .attr("r", totalNodes > 1000 ? 3.5 : 5)
          .attr("fill", nodeId === selectedFile ? SELECTED_COLOR : NODE_COLOR);
      }, 3000);
      pulseTimersRef.current.push(timer);
    });

    return () => {
      pulseTimersRef.current.forEach(clearTimeout);
      pulseTimersRef.current = [];
    };
  }, [activeNodes, selectedFile, totalNodes]);

  return (
    <div className="relative h-full overflow-hidden bg-[radial-gradient(circle_at_1px_1px,#1f2937_1px,transparent_0)] [background-size:24px_24px]">
      {!totalNodes && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <div>
            <p className="text-sm font-medium text-zinc-300">No graph loaded</p>
            <p className="mt-1 text-xs text-zinc-500">
              Analyse a GitHub repository to see files and dependencies.
            </p>
          </div>
        </div>
      )}

      {totalNodes > LARGE_GRAPH_LABEL_LIMIT && (
        <div className="absolute left-4 top-4 z-10 rounded-md border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-xs text-zinc-400 shadow-lg shadow-black/20">
          {totalNodes.toLocaleString()} files. Hover nodes for filenames, scroll to zoom.
        </div>
      )}

      <svg ref={svgRef} className="block h-full w-full" />

      {!!totalNodes && (
        <div className="absolute bottom-4 left-4 rounded-md border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-xs text-zinc-400 shadow-lg shadow-black/20">
          {totalNodes.toLocaleString()} nodes / {totalEdges.toLocaleString()} imports
        </div>
      )}
    </div>
  );
}
