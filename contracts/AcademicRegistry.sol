// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Academic credentials: issuer authorization, immutable hashes and revocation.
/// @dev The ledger commits to documents; accreditation and factual correctness are external.
contract AcademicRegistry {
    address public immutable administrator;
    struct University { string name; bool registered; bool approved; }
    struct Certificate {
        bytes32 documentHash;
        address issuer;
        address student;
        uint64 issuedAt;
        uint64 revokedAt;
        bytes32 revocationReasonHash;
    }
    mapping(address => University) public universities;
    mapping(address => bytes32) public students;
    mapping(bytes32 => Certificate) public certificates;
    address[] public universityAddresses;
    bytes32[] public certificateIds;
    uint256 public studentCount;
    uint256 public revokedCount;

    event UniversityRegistered(address indexed university, string name);
    event UniversityApproval(address indexed university, bool approved);
    event StudentRegistered(address indexed student, bytes32 identityCommitment);
    event CertificateIssued(bytes32 indexed id, address indexed issuer, address indexed student, bytes32 documentHash);
    event CertificateRevoked(bytes32 indexed id, address indexed issuer, bytes32 reasonHash);

    constructor(address admin) {
        require(admin != address(0), "Zero administrator");
        administrator = admin;
    }
    modifier onlyAdministrator() {
        require(msg.sender == administrator, "Administrator only"); _;
    }
    function registerUniversity(string calldata name) external {
        require(msg.sender != administrator, "Administrator reserved");
        require(!universities[msg.sender].registered && students[msg.sender] == bytes32(0), "Already registered");
        require(bytes(name).length > 0 && bytes(name).length <= 120, "Invalid university name");
        universities[msg.sender] = University(name, true, false);
        universityAddresses.push(msg.sender);
        emit UniversityRegistered(msg.sender, name);
    }
    function approveUniversity(address university, bool approved) external onlyAdministrator {
        require(universities[university].registered, "Unknown university");
        require(universities[university].approved != approved, "Unchanged approval");
        universities[university].approved = approved;
        emit UniversityApproval(university, approved);
    }
    function registerStudent(bytes32 identityCommitment) external {
        require(msg.sender != administrator, "Administrator reserved");
        require(students[msg.sender] == bytes32(0) && !universities[msg.sender].registered, "Already registered");
        require(identityCommitment != bytes32(0), "Empty identity commitment");
        students[msg.sender] = identityCommitment;
        ++studentCount;
        emit StudentRegistered(msg.sender, identityCommitment);
    }
    function issue(bytes32 id, bytes32 documentHash, address student) external {
        require(universities[msg.sender].approved, "Approved university only");
        require(students[student] != bytes32(0), "Unknown student");
        require(id != bytes32(0) && documentHash != bytes32(0), "Empty commitment");
        require(certificates[id].issuer == address(0), "Certificate already exists");
        certificates[id] = Certificate(documentHash, msg.sender, student, uint64(block.timestamp), 0, bytes32(0));
        certificateIds.push(id);
        emit CertificateIssued(id, msg.sender, student, documentHash);
    }
    function revoke(bytes32 id, bytes32 reasonHash) external {
        Certificate storage certificate = certificates[id];
        require(certificate.issuer != address(0), "Unknown certificate");
        require(certificate.issuer == msg.sender, "Issuing university only");
        require(certificate.revokedAt == 0, "Already revoked");
        require(reasonHash != bytes32(0), "Empty revocation reason");
        // A suspended university can still withdraw its own mistaken certificate.
        certificate.revokedAt = uint64(block.timestamp);
        certificate.revocationReasonHash = reasonHash;
        ++revokedCount;
        emit CertificateRevoked(id, msg.sender, reasonHash);
    }
    /// @return 0 unknown, 1 valid, 2 altered, 3 revoked, 4 issuer suspended.
    function verify(bytes32 id, bytes32 documentHash) external view returns (uint8) {
        Certificate storage certificate = certificates[id];
        if (certificate.issuer == address(0)) return 0;
        if (certificate.documentHash != documentHash) return 2;
        if (certificate.revokedAt != 0) return 3;
        if (!universities[certificate.issuer].approved) return 4;
        return 1;
    }
    function universityCount() external view returns (uint256) { return universityAddresses.length; }
    function certificateCount() external view returns (uint256) { return certificateIds.length; }
}
